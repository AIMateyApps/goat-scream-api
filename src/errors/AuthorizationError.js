const AppError = require('./AppError');

/**
 * Authorization error (403 Forbidden)
 * Used when authentication succeeds but user lacks permission for the requested resource/action
 */
class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions', resource = null, action = null) {
    super(message, 403, 'AUTHORIZATION_ERROR', true);
    this.resource = resource; // The resource that was attempted to access
    this.action = action; // The action that was attempted (e.g., 'read', 'write', 'delete')
  }

  toJSON() {
    const obj = super.toJSON();
    if (this.resource) {
      obj.error.resource = this.resource;
    }
    if (this.action) {
      obj.error.action = this.action;
    }
    return obj;
  }
}

module.exports = AuthorizationError;
