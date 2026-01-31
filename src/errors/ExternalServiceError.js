const AppError = require('./AppError');

/**
 * External service error (502 Bad Gateway)
 * Used when external services (Cloudinary, etc.) fail
 */
class ExternalServiceError extends AppError {
  constructor(message = 'External service error', service = null, originalError = null) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', true);
    this.service = service;
    this.originalError = originalError;
  }

  toJSON() {
    const obj = super.toJSON();
    if (this.service) {
      obj.error.service = this.service;
    }
    // Never expose original error details in production
    if (process.env.NODE_ENV === 'development' && this.originalError) {
      obj.error.original_error = this.originalError.message;
    }
    return obj;
  }
}

module.exports = ExternalServiceError;
