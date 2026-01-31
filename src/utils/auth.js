/**
 * Authentication utilities for admin routes.
 * Provides timing-safe token comparison and middleware.
 */

const { timingSafeEqual } = require('crypto');
const { AppError } = require('../errors');

/**
 * Constant-time string comparison to prevent timing attacks.
 * Returns true if strings are equal, false otherwise.
 *
 * @param {string} a - First string to compare
 * @param {string} b - Second string to compare
 * @returns {boolean} True if strings are equal
 */
function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  // Ensure both buffers are same length to prevent length-based timing leaks
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Still do comparison to maintain constant time, but result is false
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Express middleware that requires a valid admin token.
 * Token is read from x-admin-token header and compared against ADMIN_TOKEN env var.
 *
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 * @returns {void}
 */
function requireAdmin(req, res, next) {
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  if (!ADMIN_TOKEN) {
    return next(new AppError('ADMIN_TOKEN not configured on server', 500, 'CONFIGURATION_ERROR'));
  }
  const token = req.headers['x-admin-token'];
  if (!secureCompare(token, ADMIN_TOKEN)) {
    return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));
  }
  return next();
}

module.exports = {
  secureCompare,
  requireAdmin,
};
