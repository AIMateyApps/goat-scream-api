const { error: logError } = require('../utils/logger');
const { GatewayTimeoutError } = require('../errors');

/**
 * Request timeout middleware
 * Sets a timeout on requests and returns 504 Gateway Timeout if exceeded
 *
 * Supports per-route configuration via req.timeoutMs or route-specific options
 *
 * @param {number|Object} timeoutMsOrOptions - Timeout in milliseconds (default: 30000) or options object
 * @param {number} timeoutMsOrOptions.default - Default timeout in milliseconds
 * @param {Object} timeoutMsOrOptions.routes - Route-specific timeouts: { '/api/stats': 10000, '/api/submissions': 60000 }
 * @returns {Function} Express middleware function
 */
function timeoutMiddleware(timeoutMsOrOptions = 30000) {
  // Parse options
  let defaultTimeout = 30000;
  let routeTimeouts = {};

  if (typeof timeoutMsOrOptions === 'object' && timeoutMsOrOptions !== null) {
    defaultTimeout =
      timeoutMsOrOptions.default || parseInt(process.env.REQUEST_TIMEOUT_MS || 30000, 10);
    routeTimeouts = timeoutMsOrOptions.routes || {};
  } else {
    defaultTimeout = parseInt(process.env.REQUEST_TIMEOUT_MS || timeoutMsOrOptions, 10);
  }

  return (req, res, next) => {
    // Determine timeout for this request
    let timeout = defaultTimeout;

    // Check if route-specific timeout is configured
    const path = req.path || req.originalUrl?.split('?')[0];
    if (path && routeTimeouts[path]) {
      timeout = routeTimeouts[path];
    }

    // Allow override via req.timeoutMs (set by route handlers)
    if (req.timeoutMs && typeof req.timeoutMs === 'number') {
      timeout = req.timeoutMs;
    }

    // Set timeout on request
    req.setTimeout(timeout, () => {
      // Timeout handler
      if (!res.headersSent) {
        const error = new GatewayTimeoutError(`Request timed out after ${timeout}ms`);
        error.requestId = req.requestId || 'unknown';

        logError('Request timeout', {
          request_id: req.requestId,
          method: req.method,
          path: req.originalUrl,
          timeout_ms: timeout,
        });

        res.status(504).json({
          error: {
            code: error.code,
            message: error.message,
            request_id: error.requestId,
          },
        });
      }
    });

    // Clear timeout when response finishes
    res.on('finish', () => {
      if (req.clearTimeout) {
        req.clearTimeout();
      }
    });

    next();
  };
}

module.exports = timeoutMiddleware;
