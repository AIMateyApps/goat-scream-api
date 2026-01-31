const AppError = require('./AppError');

/**
 * Quota exceeded error (429 Too Many Requests)
 * Used when API quota/limit is exceeded (e.g., daily quota, monthly quota)
 * More specific than RateLimitError - indicates quota exhaustion, not just rate limiting
 */
class QuotaExceededError extends AppError {
  constructor(message = 'Quota exceeded', quotaType = null, limit = null, resetAt = null) {
    super(message, 429, 'QUOTA_EXCEEDED', true);
    this.quotaType = quotaType; // e.g., 'daily', 'monthly', 'api_key'
    this.limit = limit; // The quota limit that was exceeded
    this.resetAt = resetAt; // ISO timestamp when quota resets
  }

  toJSON() {
    const obj = super.toJSON();
    if (this.quotaType) {
      obj.error.quota_type = this.quotaType;
    }
    if (this.limit !== null) {
      obj.error.limit = this.limit;
    }
    if (this.resetAt) {
      obj.error.reset_at = this.resetAt;
    }
    return obj;
  }
}

module.exports = QuotaExceededError;
