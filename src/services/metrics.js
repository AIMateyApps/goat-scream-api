const promClient = require('prom-client');

// Create a Registry to register metrics
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// HTTP Request Counter - tracks total requests by method, path, status
const httpRequestCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

// HTTP Request Duration Histogram - tracks request duration
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30], // buckets in seconds
  registers: [register],
});

// Active Connections Gauge - tracks active connections
const activeConnections = new promClient.Gauge({
  name: 'http_active_connections',
  help: 'Number of active HTTP connections',
  registers: [register],
});

// Error Counter - tracks errors by type
const errorCounter = new promClient.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors',
  labelNames: ['method', 'path', 'status', 'error_type'],
  registers: [register],
});

// Cache Hit/Miss Counter - tracks cache effectiveness
const cacheCounter = new promClient.Counter({
  name: 'cache_operations_total',
  help: 'Total number of cache operations',
  labelNames: ['operation', 'result', 'cache_type'],
  registers: [register],
});

// Cache Hit Counter - dedicated counter for cache hits
const cacheHits = new promClient.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [register],
});

// Cache Miss Counter - dedicated counter for cache misses
const cacheMisses = new promClient.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

// Cache Hit Rate Gauge - calculated hit rate percentage
const cacheHitRate = new promClient.Gauge({
  name: 'cache_hit_rate',
  help: 'Cache hit rate percentage (0-100)',
  labelNames: ['cache_type'],
  registers: [register],
});

// Internal counters for hit rate calculation (maintained separately for accuracy)
const cacheHitCounts = new Map(); // cacheType -> { hits, misses }

/**
 * Increment request counter
 */
function incrementRequestCounter(method, path, status) {
  // Normalize path to avoid high cardinality (e.g., remove IDs)
  const normalizedPath = normalizePath(path);
  httpRequestCounter.inc({ method, path: normalizedPath, status });
}

/**
 * Record request duration
 */
function recordRequestDuration(method, path, status, durationSeconds) {
  const normalizedPath = normalizePath(path);
  httpRequestDuration.observe({ method, path: normalizedPath, status }, durationSeconds);
}

/**
 * Increment active connections
 */
function incrementActiveConnections() {
  activeConnections.inc();
}

/**
 * Decrement active connections
 */
function decrementActiveConnections() {
  activeConnections.dec();
}

/**
 * Increment error counter
 */
function incrementErrorCounter(method, path, status, errorType) {
  const normalizedPath = normalizePath(path);
  errorCounter.inc({ method, path: normalizedPath, status, error_type: errorType });
}

/**
 * Record cache operation (hit or miss)
 * @param {string} operation - Operation type ('get', 'set', 'del', 'clear')
 * @param {string} result - Result type ('hit', 'miss', 'set', 'deleted')
 * @param {string} cacheType - Cache type ('redis', 'memory')
 */
function recordCacheOperation(operation, result, cacheType = 'memory') {
  cacheCounter.inc({ operation, result, cache_type: cacheType });

  // Track dedicated hit/miss counters for get operations
  if (operation === 'get') {
    if (result === 'hit') {
      cacheHits.inc({ cache_type: cacheType });
      // Update internal counter
      if (!cacheHitCounts.has(cacheType)) {
        cacheHitCounts.set(cacheType, { hits: 0, misses: 0 });
      }
      cacheHitCounts.get(cacheType).hits += 1;
    } else if (result === 'miss') {
      cacheMisses.inc({ cache_type: cacheType });
      // Update internal counter
      if (!cacheHitCounts.has(cacheType)) {
        cacheHitCounts.set(cacheType, { hits: 0, misses: 0 });
      }
      cacheHitCounts.get(cacheType).misses += 1;
    }

    // Calculate and update hit rate
    updateCacheHitRate(cacheType);
  }
}

/**
 * Calculate and update cache hit rate for a given cache type
 * @param {string} cacheType - Cache type ('redis', 'memory')
 * @private
 */
function updateCacheHitRate(cacheType) {
  // Get or initialize counters for this cache type
  if (!cacheHitCounts.has(cacheType)) {
    cacheHitCounts.set(cacheType, { hits: 0, misses: 0 });
  }

  const counts = cacheHitCounts.get(cacheType);
  const total = counts.hits + counts.misses;

  // Calculate hit rate percentage
  if (total > 0) {
    const hitRate = (counts.hits / total) * 100;
    cacheHitRate.set({ cache_type: cacheType }, hitRate);
  } else {
    cacheHitRate.set({ cache_type: cacheType }, 0);
  }
}

/**
 * Normalize path to avoid high cardinality
 * Removes IDs and other dynamic segments
 */
function normalizePath(path) {
  if (!path) return 'unknown';

  // Normalize common patterns
  return path
    .replace(/\/api\/screams\/[^/]+/g, '/api/screams/:id')
    .replace(/\/api\/screams\/ordered\/[^/]+/g, '/api/screams/ordered/:index')
    .replace(/\/api\/submissions\/[^/]+/g, '/api/submissions/:id')
    .replace(/\/api\/moderation\/[^/]+/g, '/api/moderation/:id')
    .split('?')[0]; // Remove query strings
}

/**
 * Middleware to collect metrics automatically
 */
function metricsMiddleware(req, res, next) {
  const start = Date.now();

  // Increment active connections
  incrementActiveConnections();

  // Decrement on response finish
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    const method = req.method;
    const path = req.originalUrl || req.path;
    const status = res.statusCode;

    // Record metrics
    incrementRequestCounter(method, path, status);
    recordRequestDuration(method, path, status, duration);
    decrementActiveConnections();

    // Track errors (4xx and 5xx)
    if (status >= 400) {
      const errorType = status >= 500 ? 'server_error' : 'client_error';
      incrementErrorCounter(method, path, status, errorType);
    }
  });

  next();
}

/**
 * Get metrics in Prometheus format
 */
async function getMetrics() {
  return register.metrics();
}

/**
 * Reset all metrics (useful for testing)
 */
function resetMetrics() {
  register.resetMetrics();
  cacheHitCounts.clear();
}

module.exports = {
  metricsMiddleware,
  getMetrics,
  incrementRequestCounter,
  recordRequestDuration,
  incrementActiveConnections,
  decrementActiveConnections,
  incrementErrorCounter,
  recordCacheOperation,
  resetMetrics,
  register,
  // Expose cache metrics for testing/debugging
  _cacheHits: cacheHits,
  _cacheMisses: cacheMisses,
  _cacheHitRate: cacheHitRate,
};
