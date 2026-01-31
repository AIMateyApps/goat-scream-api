/**
 * Base application error class
 * All custom errors should extend this class
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.requestId = null; // Will be set by error handler middleware

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for API responses
   * @returns {Object} Sanitized error object safe for production
   */
  toJSON() {
    const obj = {
      error: {
        code: this.code,
        message: this.message,
      },
    };

    // Only include request_id if set
    if (this.requestId) {
      obj.error.request_id = this.requestId;
    }

    // Include stack trace in development only
    if (process.env.NODE_ENV === 'development') {
      obj.error.stack = this.stack;
    }

    return obj;
  }
}

module.exports = AppError;
