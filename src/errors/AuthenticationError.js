const AppError = require('./AppError');

/**
 * Authentication error (401 Unauthorized)
 * Used when authentication fails (invalid credentials, missing auth, expired token)
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', authType = null) {
    super(message, 401, 'AUTHENTICATION_ERROR', true);
    this.authType = authType; // e.g., 'api_key', 'bearer_token', 'basic'
  }

  toJSON() {
    const obj = super.toJSON();
    if (this.authType) {
      obj.error.auth_type = this.authType;
    }
    return obj;
  }
}

module.exports = AuthenticationError;
