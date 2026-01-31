/**
 * Cache middleware for HTTP response caching with ETag support.
 *
 * Provides:
 * - Cache-Control headers based on route configuration
 * - Weak ETag generation from response content
 * - Conditional request handling (If-None-Match → 304)
 */

const { createHash } = require('crypto');

/**
 * Default cache configuration by route pattern.
 * Routes not matching any pattern get no caching headers.
 */
const DEFAULT_CONFIG = {
  // Random endpoint should never be cached (defeats the purpose)
  '/api/v1/screams/random': { directive: 'no-store' },

  // List/detail endpoints - moderate cache with revalidation
  '/api/v1/screams': { directive: 'public', maxAge: 300, staleWhileRevalidate: 60 },
  '/api/v1/search': { directive: 'public', maxAge: 60, staleWhileRevalidate: 30 },
  '/api/v1/stats': { directive: 'public', maxAge: 60, staleWhileRevalidate: 30 },

  // Health/operational endpoints - never cache
  '/health': { directive: 'no-store' },
  '/ready': { directive: 'no-store' },
  '/metrics': { directive: 'no-store' },
};

/**
 * Generate a weak ETag from response body.
 * Uses MD5 for speed (not security-critical).
 *
 * @param {string|Buffer} body - Response body
 * @returns {string} Weak ETag (e.g., W/"abc123")
 */
function generateETag(body) {
  const hash = createHash('md5').update(body).digest('hex').slice(0, 16);
  return `W/"${hash}"`;
}

/**
 * Check if request's If-None-Match header matches the ETag.
 *
 * @param {string} ifNoneMatch - If-None-Match header value
 * @param {string} etag - Generated ETag
 * @returns {boolean} True if ETags match (304 should be returned)
 */
function etagMatches(ifNoneMatch, etag) {
  if (!ifNoneMatch || !etag) return false;

  // Handle multiple ETags in If-None-Match (comma-separated)
  const tags = ifNoneMatch.split(',').map(t => t.trim());

  // Check for wildcard or exact match
  return tags.includes('*') || tags.includes(etag) || tags.includes(etag.replace('W/', ''));
}

/**
 * Build Cache-Control header value from config.
 *
 * @param {object} config - Cache configuration
 * @returns {string} Cache-Control header value
 */
function buildCacheControl(config) {
  if (config.directive === 'no-store') {
    return 'no-store, no-cache, must-revalidate';
  }

  const parts = [config.directive];

  if (config.maxAge !== undefined) {
    parts.push(`max-age=${config.maxAge}`);
  }

  if (config.staleWhileRevalidate !== undefined) {
    parts.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
  }

  return parts.join(', ');
}

/**
 * Find cache config for a given path.
 * Matches by prefix (e.g., /api/v1/screams matches /api/v1/screams/123).
 *
 * @param {string} path - Request path
 * @param {object} config - Route configuration
 * @returns {object|null} Cache config or null if no match
 */
function findCacheConfig(path, config) {
  // Check for exact match first
  if (config[path]) {
    return config[path];
  }

  // Check for prefix match (longest match wins)
  const matches = Object.keys(config)
    .filter(pattern => path.startsWith(pattern))
    .sort((a, b) => b.length - a.length);

  return matches.length > 0 ? config[matches[0]] : null;
}

/**
 * Cache middleware factory.
 *
 * @param {object} [options] - Configuration options
 * @param {object} [options.routes] - Custom route cache configurations
 * @param {boolean} [options.etag=true] - Whether to generate ETags
 * @returns {Function} Express middleware
 *
 * @example
 * // Use default config
 * app.use(cacheMiddleware());
 *
 * @example
 * // Custom config
 * app.use(cacheMiddleware({
 *   routes: {
 *     '/api/v1/custom': { directive: 'private', maxAge: 120 }
 *   }
 * }));
 */
function cacheMiddleware(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options.routes };
  const enableETag = options.etag !== false;

  return function cache(req, res, next) {
    // Skip for non-GET/HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    const cacheConfig = findCacheConfig(req.path, config);

    // No cache config for this route
    if (!cacheConfig) {
      return next();
    }

    // Set Cache-Control header
    const cacheControl = buildCacheControl(cacheConfig);
    res.setHeader('Cache-Control', cacheControl);

    // Skip ETag for no-store responses
    if (cacheConfig.directive === 'no-store' || !enableETag) {
      return next();
    }

    // Intercept res.json to add ETag and handle conditional requests
    const originalJson = res.json.bind(res);

    res.json = function (body) {
      // Generate ETag from stringified body
      const bodyString = JSON.stringify(body);
      const etag = generateETag(bodyString);

      res.setHeader('ETag', etag);

      // Check If-None-Match for conditional request
      const ifNoneMatch = req.get('If-None-Match');
      if (etagMatches(ifNoneMatch, etag)) {
        // Content hasn't changed - return 304 Not Modified
        res.status(304);
        return res.end();
      }

      // Content changed or no conditional request - return full response
      return originalJson(body);
    };

    next();
  };
}

module.exports = cacheMiddleware;
module.exports.generateETag = generateETag;
module.exports.etagMatches = etagMatches;
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
