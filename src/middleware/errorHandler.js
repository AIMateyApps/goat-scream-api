/**
 * Centralized error handler middleware
 * Handles all errors in the application with proper formatting and tracking
 */

const mongoose = require('mongoose');
const {
  AppError,
  ValidationError,
  // NotFoundError, DatabaseError, ExternalServiceError - kept for future use
} = require('../errors');
const errorTracking = require('../services/errorTracking');
const { warn: logWarn, error: logError } = require('../utils/logger');

/**
 * Express error handler middleware (4-arg function)
 * Must be added after all routes
 * Note: Express requires 4 parameters to recognize this as an error handler
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Set request ID on error for correlation
  const requestId = req.requestId || 'unknown';
  if (err instanceof AppError) {
    err.requestId = requestId;
  }

  // Convert Mongoose validation errors to ValidationError
  if (err instanceof mongoose.Error.ValidationError) {
    const validationErrors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message,
    }));
    err = new ValidationError('Validation failed', validationErrors);
    err.requestId = requestId;
  }

  // Convert Mongoose CastError (invalid ObjectId, etc.) to ValidationError
  if (err instanceof mongoose.Error.CastError) {
    err = new ValidationError(`Invalid ${err.path}: ${err.value}`, {
      field: err.path,
      value: err.value,
    });
    err.requestId = requestId;
  }

  // Handle AppError instances
  if (err instanceof AppError) {
    const statusCode = err.statusCode || 500;
    const isOperational = err.isOperational !== false;

    // Track error
    errorTracking.trackError(
      err,
      {
        request_id: requestId,
        route: req.originalUrl,
        method: req.method,
        ip: req.ip,
        status_code: statusCode,
        error_code: err.code,
        is_operational: isOperational,
      },
      isOperational
    );

    // Log error with context
    const logContext = {
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status_code: statusCode,
      error_code: err.code,
      error_message: err.message,
    };

    if (isOperational) {
      logWarn(logContext);
    } else {
      logError({
        ...logContext,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      });
    }

    // Return error response
    return res.status(statusCode).json(err.toJSON());
  }

  // Handle unknown errors (not AppError instances)
  // Track unknown errors (always 5xx)
  errorTracking.trackError(
    err,
    {
      request_id: requestId,
      route: req.originalUrl,
      method: req.method,
      ip: req.ip,
      status_code: 500,
      error_type: 'UNKNOWN_ERROR',
    },
    false
  );

  // Log unknown error with full context
  logError({
    request_id: requestId,
    method: req.method,
    path: req.originalUrl,
    status_code: 500,
    error_name: err.name,
    error_message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  // Return generic 500 response (never expose stack traces in production)
  const response = {
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
      request_id: requestId,
    },
  };

  if (process.env.NODE_ENV === 'development') {
    response.error.stack = err.stack;
  }

  return res.status(500).json(response);
}

module.exports = errorHandler;
