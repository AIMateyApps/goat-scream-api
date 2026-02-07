const AppError = require('./AppError');

/**
 * Database error (503 Service Unavailable)
 * Used for database connection issues, query failures, etc.
 */
class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', operation = null) {
    super(message, 503, 'DATABASE_ERROR', true);
    this.operation = operation;
  }

  toJSON() {
    const obj = super.toJSON();
    if (this.operation) {
      obj.error.operation = this.operation;
    }
    return obj;
  }
}

module.exports = DatabaseError;
