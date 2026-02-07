# Dual-Layer Caching: Redis + In-Memory Fallback

Redis is fast, but Redis being down shouldn't break your API. A dual-layer cache tries Redis first and falls back to in-memory storage, ensuring caching always works.

## Mental Model

The cache service abstracts away the storage backend:

```
Service: cache.get('screams:intense')
              ↓
         CacheService
              ↓
    ┌─────────┴─────────┐
    │   Redis available? │
    │         ↓          │
    │   Yes → Redis      │
    │   No  → Memory Map │
    └───────────────────┘
```

Callers don't know or care which backend is active. The cache service handles:

- Connection failures
- Timeouts
- Serialization/deserialization
- TTL management

## Copy This Pattern

```javascript
// services/cache.js
const { createHash } = require('crypto');

class CacheService {
  constructor() {
    this.redis = null;
    this.enabled = false;
    this.memoryCache = new Map();
    this.memoryCacheTTL = new Map();
    this._initializeRedis();
  }

  _initializeRedis() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return; // Use memory fallback

    try {
      const redis = require('redis');
      const client = redis.createClient({ url: redisUrl });

      client.on('error', err => {
        console.warn('Redis error:', err.message);
        this.enabled = false;
        this.redis = null;
      });

      client.on('connect', () => {
        this.enabled = true;
        this.redis = client;
      });

      client.connect().catch(() => {
        this.enabled = false;
      });
    } catch {
      this.enabled = false;
    }
  }

  async get(key) {
    if (this.enabled && this.redis) {
      try {
        const value = await this.redis.get(key);
        return value ? JSON.parse(value) : null;
      } catch {
        return this._getFromMemory(key);
      }
    }
    return this._getFromMemory(key);
  }

  async set(key, value, ttlSeconds = 60) {
    const serialized = JSON.stringify(value);

    if (this.enabled && this.redis) {
      try {
        await this.redis.setEx(key, ttlSeconds, serialized);
        return;
      } catch {
        this._setInMemory(key, value, ttlSeconds);
        return;
      }
    }

    this._setInMemory(key, value, ttlSeconds);
  }

  async del(key) {
    if (this.enabled && this.redis) {
      try {
        await this.redis.del(key);
        return;
      } catch {
        this._delFromMemory(key);
      }
    }
    this._delFromMemory(key);
  }

  generateKey(prefix, query) {
    const queryStr = JSON.stringify(query);
    const hash = createHash('md5').update(queryStr).digest('hex');
    return `${prefix}:${hash}`;
  }

  _getFromMemory(key) {
    const ttl = this.memoryCacheTTL.get(key);
    if (ttl && Date.now() > ttl) {
      this.memoryCache.delete(key);
      this.memoryCacheTTL.delete(key);
      return null;
    }
    return this.memoryCache.get(key) || null;
  }

  _setInMemory(key, value, ttlSeconds) {
    this.memoryCache.set(key, value);
    this.memoryCacheTTL.set(key, Date.now() + ttlSeconds * 1000);
  }

  _delFromMemory(key) {
    this.memoryCache.delete(key);
    this.memoryCacheTTL.delete(key);
  }

  getStats() {
    return {
      enabled: this.enabled,
      type: this.enabled ? 'redis' : 'memory',
      memoryCacheSize: this.memoryCache.size,
    };
  }
}

// Singleton instance
module.exports = new CacheService();
```

## In This Repo

**Cache service:** `src/services/cache.js:22-267`

Key features:

1. **Redis initialization with fallback** (lines 35-68):

   ```javascript
   _initializeRedis() {
     const redisUrl = process.env.REDIS_URL;
     if (!redisUrl) return; // Use memory fallback

     try {
       const client = redis.createClient({ url: redisUrl });
       client.on('error', err => {
         this.enabled = false;
         this.redis = null;
       });
       // ...
     } catch {
       this.enabled = false;
     }
   }
   ```

2. **Get with fallback** (lines 76-107):

   ```javascript
   async get(key) {
     if (this.enabled && this.redis) {
       try {
         const value = await this.redis.get(key);
         return value ? JSON.parse(value) : null;
       } catch {
         return this._getFromMemory(key); // Fallback on error
       }
     }
     return this._getFromMemory(key);
   }
   ```

3. **Cache key generation** (lines 196-200):

   ```javascript
   generateKey(prefix, query) {
     const queryStr = JSON.stringify(query);
     const hash = createHash('md5').update(queryStr).digest('hex');
     return `${prefix}:${hash}`;
   }
   ```

4. **TTL-aware memory cache** (lines 206-214):
   ```javascript
   _getFromMemory(key) {
     const ttl = this.memoryCacheTTL.get(key);
     if (ttl && Date.now() > ttl) {
       this.memoryCache.delete(key);
       this.memoryCacheTTL.delete(key);
       return null;
     }
     return this.memoryCache.get(key) || null;
   }
   ```

**Usage in service:** `src/services/screamsService.js:197-225`

```javascript
async getIntenseScreams(limit = 10) {
  // Check cache
  const cacheKey = cache.generateKey('screams:intense', { limit: limitNum });
  const cached = await cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const screams = await this.repository.find(/* ... */);

  // Cache result (60s TTL)
  await cache.set(cacheKey, screams, 60);

  return screams;
}
```

**Search pattern:** `grep -rn "cache\." src/services/`

## Try It

Add caching to `getBreeds()` with a 5-minute TTL:

1. Open `src/services/screamsService.js`

2. Import cache at the top (already there):

   ```javascript
   const cache = require('./cache');
   ```

3. Modify `getBreeds()` method (around line 231):

   ```javascript
   async getBreeds() {
     // Check cache (5-minute TTL)
     const cacheKey = 'screams:breeds';
     const cached = await cache.get(cacheKey);
     if (cached) {
       return cached;
     }

     const breeds = await this.repository.distinct('goat.breed', { approved: true });
     const filteredBreeds = breeds.filter(Boolean);

     // Cache for 5 minutes (300 seconds)
     await cache.set(cacheKey, filteredBreeds, 300);

     return filteredBreeds;
   }
   ```

4. Test it:

   ```bash
   # First request - cache miss
   time curl -s "http://localhost:3000/api/v1/screams/breeds" > /dev/null

   # Second request - cache hit (should be faster)
   time curl -s "http://localhost:3000/api/v1/screams/breeds" > /dev/null
   ```

5. Check cache stats (if you have Redis):
   ```bash
   redis-cli KEYS "screams:*"
   redis-cli TTL "screams:breeds"
   ```

## Debugging Checklist

| Symptom                        | Check                                                           |
| ------------------------------ | --------------------------------------------------------------- |
| Cache always miss              | `REDIS_URL` set? Check `cache.getStats().enabled`               |
| Memory cache growing unbounded | TTL cleanup working? Items should expire                        |
| Stale data after updates       | Cache invalidation implemented? Call `cache.del(key)` on writes |
| "redis is not defined"         | `redis` package installed? `pnpm add redis`                     |
| Slow even with caching         | Key collisions? Log cache keys to verify uniqueness             |
| Tests affecting each other     | Cache disabled in test mode? Check `NODE_ENV === 'test'` bypass |

## FAQ

**Q: Why use MD5 for cache keys?**

A: MD5 is fast and produces short, consistent hashes. It's not used for security here—just to create unique keys from query objects. SHA-256 would work too but produces longer strings.

**Q: Should I cache everything?**

A: Cache read-heavy, compute-heavy, or rarely-changing data. Don't cache:

- Random endpoints (defeats the purpose)
- User-specific data in shared cache
- Rapidly changing data with short TTLs

**Q: How do I invalidate cache on writes?**

A: Delete relevant keys when data changes:

```javascript
async createScream(data) {
  const scream = await this.repository.create(data);
  await cache.clear('screams:*'); // Clear all scream caches
  return scream;
}
```

**Q: Memory cache in production?**

A: Fine for single-instance deployments. For multiple instances, use Redis or requests may hit different caches. Memory cache is best as a fallback, not primary.

**Q: Why a singleton?**

A: One Redis connection shared across the app. Multiple connections would waste resources. The singleton pattern ensures everyone uses the same cache instance.

## Further Reading

- Redis: [Node.js Client](https://redis.io/docs/clients/nodejs/)
- Node.js: [Caching Best Practices](https://blog.appsignal.com/2021/07/28/caching-strategies-in-nodejs.html)
- AWS: [Caching Strategies](https://aws.amazon.com/caching/best-practices/)

## Next Guide

[05-http-cache-headers.md](./05-http-cache-headers.md) - Configure Cache-Control and ETags for client-side caching.
