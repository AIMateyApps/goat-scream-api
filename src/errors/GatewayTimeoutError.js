const AppError = require('./AppError');

/**
 * Gateway Timeout Error (504)
 * Used when a request exceeds the configured timeout
 */
class GatewayTimeoutError extends AppError {
  constructor(message = 'Gateway Timeout') {
    super(message, 504, 'GATEWAY_TIMEOUT', true);
  }
}

module.exports = GatewayTimeoutError;
