const AppError = require('./AppError');

/**
 * Not found error (404 Not Found)
 * Used when a requested resource doesn't exist
 */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found', resource = null) {
    super(message, 404, 'NOT_FOUND', true);
    this.resource = resource;
  }

  toJSON() {
    const obj = super.toJSON();
    if (this.resource) {
      obj.error.resource = this.resource;
    }
    return obj;
  }
}

module.exports = NotFoundError;
