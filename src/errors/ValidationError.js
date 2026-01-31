const AppError = require('./AppError');

/**
 * Validation error (400 Bad Request)
 * Used for invalid input, malformed requests, etc.
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR', true);
    this.details = details; // Can be array of validation errors or object
  }

  toJSON() {
    const obj = super.toJSON();
    if (this.details) {
      obj.error.details = this.details;
    }
    return obj;
  }
}

module.exports = ValidationError;
