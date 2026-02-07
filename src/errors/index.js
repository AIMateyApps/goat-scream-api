/**
 * Centralized error exports
 * Provides convenient access to all error classes and factory functions
 */

const AppError = require('./AppError');
const ValidationError = require('./ValidationError');
const NotFoundError = require('./NotFoundError');
const RateLimitError = require('./RateLimitError');
const RateLimitExceededError = require('./RateLimitExceededError');
const QuotaExceededError = require('./QuotaExceededError');
const AuthenticationError = require('./AuthenticationError');
const AuthorizationError = require('./AuthorizationError');
const DatabaseError = require('./DatabaseError');
const ExternalServiceError = require('./ExternalServiceError');
const GatewayTimeoutError = require('./GatewayTimeoutError');

/**
 * Factory function to create ValidationError with details
 */
function validationError(message, details) {
  return new ValidationError(message, details);
}

/**
 * Factory function to create NotFoundError with resource context
 */
function notFoundError(resource, id = null) {
  const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
  return new NotFoundError(message, resource);
}

/**
 * Factory function to create DatabaseError with operation context
 */
function databaseError(message, operation) {
  return new DatabaseError(message, operation);
}

/**
 * Factory function to create ExternalServiceError with service context
 */
function externalServiceError(service, message, originalError) {
  return new ExternalServiceError(message || `${service} service error`, service, originalError);
}

/**
 * Factory function to create RateLimitExceededError with context
 */
function rateLimitExceededError(message, quota, windowMs, retryAfter) {
  return new RateLimitExceededError(message, quota, windowMs, retryAfter);
}

/**
 * Factory function to create QuotaExceededError with context
 */
function quotaExceededError(message, quotaType, limit, resetAt) {
  return new QuotaExceededError(message, quotaType, limit, resetAt);
}

/**
 * Factory function to create AuthenticationError with context
 */
function authenticationError(message, authType) {
  return new AuthenticationError(message, authType);
}

/**
 * Factory function to create AuthorizationError with context
 */
function authorizationError(message, resource, action) {
  return new AuthorizationError(message, resource, action);
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  RateLimitExceededError,
  QuotaExceededError,
  AuthenticationError,
  AuthorizationError,
  DatabaseError,
  ExternalServiceError,
  GatewayTimeoutError,
  // Factory functions
  validationError,
  notFoundError,
  databaseError,
  externalServiceError,
  rateLimitExceededError,
  quotaExceededError,
  authenticationError,
  authorizationError,
};
