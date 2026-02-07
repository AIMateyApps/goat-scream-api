const { createHash } = require('crypto');
const { warn: logWarn } = require('../utils/logger');

// Import metrics service (lazy load to avoid circular dependencies)
let metricsService = null;
function getMetricsService() {
  if (!metricsService) {
    try {
      metricsService = require('./metrics');
    } catch {
      // Metrics service not available (e.g., in tests)
      return null;
    }
  }
  return metricsService;
}

/**
 * Cache service with Redis support and graceful fallback
 * Provides caching abstraction that works with or without Redis
 */
class CacheService {
  constructor() {
    this.redis = null;
    this.enabled = false;
    this.memoryCache = new Map(); // Fallback in-memory cache
    this.memoryCacheTTL = new Map(); // TTL tracking for memory cache
    this._initializeRedis();
  }

  /**
   * Initialize Redis connection if REDIS_URL is set
   * @private
   */
  _initializeRedis() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      return; // Redis not configured, use memory cache fallback
    }

    try {
      // Try to require redis client (will be installed if needed)
      const redis = require('redis');
      const client = redis.createClient({ url: redisUrl });

      client.on('error', err => {
        // Log Redis connection errors with structured logging
        logWarn('Redis connection error', { error: err.message });
        this.enabled = false;
        this.redis = null;
      });

      client.on('connect', () => {
        this.enabled = true;
        this.redis = client;
      });

      // Attempt connection, fallback to memory cache on failure
      client.connect().catch(() => {
        // Connection failed, fallback to memory cache
        this.enabled = false;
        this.redis = null;
      });
    } catch {
      // redis package not installed or other error, use memory cache
      this.enabled = false;
      this.redis = null;
    }
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} Cached value or null if not found
   */
  async get(key) {
    // Disable caching in test mode to prevent test interference
    if (process.env.NODE_ENV === 'test') {
      return null;
    }
    if (this.enabled && this.redis) {
      try {
        const value = await this.redis.get(key);
        const metrics = getMetricsService();
        if (value) {
          if (metrics) metrics.recordCacheOperation('get', 'hit', 'redis');
          return JSON.parse(value);
        }
        if (metrics) metrics.recordCacheOperation('get', 'miss', 'redis');
        return null;
      } catch {
        // Redis error, fallback to memory cache
        const result = this._getFromMemory(key);
        const metrics = getMetricsService();
        if (metrics) {
          metrics.recordCacheOperation('get', result ? 'hit' : 'miss', 'memory');
        }
        return result;
      }
    }
    const result = this._getFromMemory(key);
    const metrics = getMetricsService();
    if (metrics) {
      metrics.recordCacheOperation('get', result ? 'hit' : 'miss', 'memory');
    }
    return result;
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlSeconds - Time to live in seconds
   * @returns {Promise<void>}
   */
  async set(key, value, ttlSeconds = 60) {
    // Disable caching in test mode to prevent test interference
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    const serialized = JSON.stringify(value);
    const metrics = getMetricsService();

    if (this.enabled && this.redis) {
      try {
        await this.redis.setEx(key, ttlSeconds, serialized);
        if (metrics) metrics.recordCacheOperation('set', 'set', 'redis');
        return;
      } catch {
        // Redis error, fallback to memory cache
        this._setInMemory(key, value, ttlSeconds);
        if (metrics) metrics.recordCacheOperation('set', 'set', 'memory');
        return;
      }
    }

    this._setInMemory(key, value, ttlSeconds);
    if (metrics) metrics.recordCacheOperation('set', 'set', 'memory');
  }

  /**
   * Delete a cache key
   * @param {string} key - Cache key to delete
   * @returns {Promise<void>}
   */
  async del(key) {
    const metrics = getMetricsService();
    if (this.enabled && this.redis) {
      try {
        await this.redis.del(key);
        if (metrics) metrics.recordCacheOperation('del', 'deleted', 'redis');
        return;
      } catch {
        // Redis error, fallback to memory cache
        this._delFromMemory(key);
        if (metrics) metrics.recordCacheOperation('del', 'deleted', 'memory');
        return;
      }
    }
    this._delFromMemory(key);
    if (metrics) metrics.recordCacheOperation('del', 'deleted', 'memory');
  }

  /**
   * Clear cache entries matching a pattern
   * @param {string} pattern - Pattern to match (e.g., 'screams:*')
   * @returns {Promise<number>} Number of keys deleted
   */
  async clear(pattern) {
    const metrics = getMetricsService();
    if (this.enabled && this.redis) {
      try {
        const keys = await this.redis.keys(pattern);
        if (keys.length === 0) return 0;
        const count = await this.redis.del(keys);
        if (metrics) metrics.recordCacheOperation('clear', 'deleted', 'redis');
        return count;
      } catch {
        // Redis error, fallback to memory cache
        const count = this._clearFromMemory(pattern);
        if (metrics) metrics.recordCacheOperation('clear', 'deleted', 'memory');
        return count;
      }
    }
    const count = this._clearFromMemory(pattern);
    if (metrics) metrics.recordCacheOperation('clear', 'deleted', 'memory');
    return count;
  }

  /**
   * Generate cache key from prefix and query object
   * @param {string} prefix - Key prefix
   * @param {Object} query - Query object to hash
   * @returns {string} Cache key
   */
  generateKey(prefix, query) {
    const queryStr = JSON.stringify(query);
    const hash = createHash('md5').update(queryStr).digest('hex');
    return `${prefix}:${hash}`;
  }

  /**
   * Get value from memory cache
   * @private
   */
  _getFromMemory(key) {
    const ttl = this.memoryCacheTTL.get(key);
    if (ttl && Date.now() > ttl) {
      this.memoryCache.delete(key);
      this.memoryCacheTTL.delete(key);
      return null;
    }
    return this.memoryCache.get(key) || null;
  }

  /**
   * Set value in memory cache
   * @private
   */
  _setInMemory(key, value, ttlSeconds) {
    this.memoryCache.set(key, value);
    this.memoryCacheTTL.set(key, Date.now() + ttlSeconds * 1000);
  }

  /**
   * Delete value from memory cache
   * @private
   */
  _delFromMemory(key) {
    this.memoryCache.delete(key);
    this.memoryCacheTTL.delete(key);
  }

  /**
   * Clear memory cache entries matching pattern
   * @private
   */
  _clearFromMemory(pattern) {
    const regex = new RegExp(pattern.replace('*', '.*'));
    let count = 0;
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
        this.memoryCacheTTL.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Get cache stats (for monitoring)
   * @returns {Object} Cache statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      type: this.enabled ? 'redis' : 'memory',
      memoryCacheSize: this.memoryCache.size,
    };
  }
}

// Singleton instance
const cacheService = new CacheService();

module.exports = cacheService;
