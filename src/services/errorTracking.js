/**
 * Error tracking service with Sentry integration
 *
 * Configurable via environment variables:
 * - SENTRY_DSN: Sentry project DSN (required for Sentry to work)
 * - ERROR_TRACKING_ENABLED: Set to 'true' to enable tracking (auto-enabled if SENTRY_DSN is set)
 * - ERROR_TRACKING_TRACK_4XX: Set to 'true' to track 4xx errors (default: false)
 * - SENTRY_TRACES_SAMPLE_RATE: Performance monitoring sample rate (default: 0.1)
 * - NODE_ENV: Used for Sentry environment tagging
 */

const Sentry = require('@sentry/node');
const { info: logInfo, error: logError } = require('../utils/logger');
const packageJson = require('../../package.json');

let initialized = false;
let errorTrackingEnabled = false;

/**
 * Initialize error tracking service with Sentry
 * Called once at app startup
 */
function initialize() {
  const dsn = process.env.SENTRY_DSN;
  const explicitlyEnabled = process.env.ERROR_TRACKING_ENABLED === 'true';

  // Enable if DSN is set OR if explicitly enabled (for testing without DSN)
  errorTrackingEnabled = !!dsn || explicitlyEnabled;

  if (!errorTrackingEnabled) {
    logInfo('Error tracking disabled (no SENTRY_DSN configured)');
    return;
  }

  if (!dsn) {
    logInfo('Error tracking enabled but SENTRY_DSN not set - using no-op mode');
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: `goat-scream-api@${packageJson.version}`,

      // Performance monitoring (optional - set to 0 to disable)
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),

      // Only send errors in production by default
      enabled: process.env.NODE_ENV !== 'test',

      // Scrub sensitive data
      beforeSend(event) {
        // Remove sensitive headers
        if (event.request?.headers) {
          delete event.request.headers['x-admin-token'];
          delete event.request.headers['x-api-key'];
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
        return event;
      },

      // Ignore common non-actionable errors
      ignoreErrors: [
        // Network errors from clients
        'ECONNRESET',
        'ETIMEDOUT',
        'ECONNREFUSED',
        // Rate limiting (expected behavior)
        'RateLimitExceededError',
      ],
    });

    initialized = true;
    logInfo('Sentry error tracking initialized', {
      environment: process.env.NODE_ENV || 'development',
      release: `goat-scream-api@${packageJson.version}`,
    });
  } catch (err) {
    logError('Failed to initialize Sentry', { error: err.message });
    errorTrackingEnabled = false;
  }
}

/**
 * Check if Sentry is properly initialized
 * @returns {boolean}
 */
function isInitialized() {
  return initialized && errorTrackingEnabled;
}

/**
 * Track an error with context
 * @param {Error} error - The error to track
 * @param {Object} context - Additional context (request_id, route, method, IP, etc.)
 * @param {boolean} isOperational - Whether this is an operational error (4xx)
 */
function trackError(error, context = {}, isOperational = false) {
  if (!errorTrackingEnabled) {
    return;
  }

  // Don't track operational errors (4xx) unless explicitly configured
  if (isOperational && process.env.ERROR_TRACKING_TRACK_4XX !== 'true') {
    return;
  }

  // Log structured error for local visibility
  const errorPayload = {
    level: 'error',
    error: {
      name: error.name,
      message: error.message,
    },
    context,
    timestamp: new Date().toISOString(),
  };
  logError(errorPayload);

  // Send to Sentry if initialized
  if (initialized) {
    Sentry.withScope(scope => {
      // Set error context
      scope.setTag('operational', isOperational);

      if (context.request_id) {
        scope.setTag('request_id', context.request_id);
      }
      if (context.route) {
        scope.setTag('route', context.route);
      }
      if (context.method) {
        scope.setTag('method', context.method);
      }
      if (context.status_code) {
        scope.setTag('status_code', context.status_code);
      }
      if (context.error_code) {
        scope.setTag('error_code', context.error_code);
      }

      // Set extra context
      scope.setExtras(context);

      // Set severity based on error type
      scope.setLevel(isOperational ? 'warning' : 'error');

      // Capture the exception
      Sentry.captureException(error);
    });
  }
}

/**
 * Track a message/event (not an error)
 * @param {string} message - Message to track
 * @param {string} level - Severity level (info, warning, error)
 * @param {Object} context - Additional context
 */
function trackMessage(message, level = 'info', context = {}) {
  if (!errorTrackingEnabled) {
    return;
  }

  // Log locally
  const messagePayload = {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  };
  logInfo(messagePayload);

  // Send to Sentry if initialized
  if (initialized) {
    Sentry.withScope(scope => {
      scope.setExtras(context);
      scope.setLevel(level);
      Sentry.captureMessage(message);
    });
  }
}

/**
 * Set user context for error tracking
 * @param {Object} user - User info (id, email, etc.)
 */
function setUser(user) {
  if (initialized) {
    Sentry.setUser(user);
  }
}

/**
 * Clear user context
 */
function clearUser() {
  if (initialized) {
    Sentry.setUser(null);
  }
}

/**
 * Add breadcrumb for debugging context
 * @param {Object} breadcrumb - Breadcrumb data
 */
function addBreadcrumb(breadcrumb) {
  if (initialized) {
    Sentry.addBreadcrumb(breadcrumb);
  }
}

/**
 * Flush pending events to Sentry
 * Call this before shutting down
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>}
 */
async function flush(timeout = 2000) {
  if (initialized) {
    return Sentry.flush(timeout);
  }
  return true;
}

/**
 * Get the Sentry SDK for advanced usage
 * @returns {Object} Sentry SDK
 */
function getSentry() {
  return Sentry;
}

module.exports = {
  initialize,
  isInitialized,
  trackError,
  trackMessage,
  setUser,
  clearUser,
  addBreadcrumb,
  flush,
  getSentry,
};
