const fs = require('fs');
const path = require('path');

// Service identification for structured logs
const SERVICE_NAME = process.env.SERVICE_NAME || 'goat-scream-api';
const SERVICE_VERSION = process.env.npm_package_version || require('../../package.json').version;

const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
const logPath = path.join(logDir, 'app.log');

function writeLog(entry) {
  const line = JSON.stringify(entry);
  fs.appendFile(logPath, `${line}\n`, err => {
    if (err) {
      // Fallback to stderr to avoid crashing on log failures
      console.error('Failed to write application log:', err.message);
    }
  });
}

/**
 * Structured logger with levels
 * Supports info, warn, error, debug
 *
 * All log entries include:
 * - service: Service name (goat-scream-api)
 * - version: Service version from package.json
 * - timestamp: ISO 8601 timestamp
 *
 * To include request context, pass { request_id: req.requestId } in context
 */
function log(level, message, context = {}) {
  const entry = {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    level,
    message: typeof message === 'string' ? message : JSON.stringify(message),
    ...context,
    timestamp: new Date().toISOString(),
  };

  // In production, log as JSON to stdout/stderr
  if (process.env.NODE_ENV === 'production') {
    const jsonLine = JSON.stringify(entry);
    if (level === 'error') {
      console.error(jsonLine);
    } else {
      console.info(jsonLine);
    }
  } else {
    // In development, use formatted output
    const prefix = `[${level.toUpperCase()}]`;
    if (level === 'error') {
      console.error(prefix, message, context);
    } else if (level === 'warn') {
      console.warn(prefix, message, context);
    } else {
      console.log(prefix, message, context);
    }
  }

  // Always write to log file
  writeLog(entry);
}

const logger = {
  info: (message, context) => log('info', message, context),
  warn: (message, context) => log('warn', message, context),
  error: (message, context) => log('error', message, context),
  debug: (message, context) => {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      log('debug', message, context);
    }
  },
};

/**
 * Create a request-scoped logger that automatically includes request_id
 * @param {Object} req - Express request object with requestId
 * @returns {Object} Logger with bound request context
 */
function createRequestLogger(req) {
  const requestContext = {
    request_id: req.requestId || req.headers['x-request-id'] || 'unknown',
  };

  return {
    info: (message, context = {}) => log('info', message, { ...requestContext, ...context }),
    warn: (message, context = {}) => log('warn', message, { ...requestContext, ...context }),
    error: (message, context = {}) => log('error', message, { ...requestContext, ...context }),
    debug: (message, context = {}) => {
      if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
        log('debug', message, { ...requestContext, ...context });
      }
    },
  };
}

module.exports = {
  writeLog,
  logPath,
  createRequestLogger,
  SERVICE_NAME,
  SERVICE_VERSION,
  ...logger,
};
