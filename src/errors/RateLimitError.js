const AppError = require('./AppError');

/**
 * Rate limit error (429 Too Many Requests)
 * Used when rate limit is exceeded
 */
class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', quota = null, windowMs = null) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', true);
    this.quota = quota;
    this.windowMs = windowMs;
  }

  toJSON() {
    const obj = super.toJSON();
    if (this.quota !== null) {
      obj.error.quota = this.quota;
    }
    if (this.windowMs !== null) {
      obj.error.window_ms = this.windowMs;
    }
    return obj;
  }
}

module.exports = RateLimitError;
