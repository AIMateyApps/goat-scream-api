const RateLimitError = require('./RateLimitError');

/**
 * Rate limit exceeded error (429 Too Many Requests)
 * More specific error for when rate limit is actually exceeded
 * Extends RateLimitError with additional context
 */
class RateLimitExceededError extends RateLimitError {
  constructor(message = 'Rate limit exceeded', quota = null, windowMs = null, retryAfter = null) {
    super(message, quota, windowMs);
    this.code = 'RATE_LIMIT_EXCEEDED';
    this.retryAfter = retryAfter; // Seconds until retry is allowed
  }

  toJSON() {
    const obj = super.toJSON();
    if (this.retryAfter !== null) {
      obj.error.retry_after = this.retryAfter;
    }
    return obj;
  }
}

module.exports = RateLimitExceededError;
