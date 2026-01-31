const GatewayTimeoutError = require('../../src/errors/GatewayTimeoutError');

describe('GatewayTimeoutError', () => {
  it('should create error with default message', () => {
    const error = new GatewayTimeoutError();
    expect(error.message).toBe('Gateway Timeout');
    expect(error.statusCode).toBe(504);
    expect(error.code).toBe('GATEWAY_TIMEOUT');
    expect(error.isOperational).toBe(true);
  });

  it('should create error with custom message', () => {
    const error = new GatewayTimeoutError('Request timed out');
    expect(error.message).toBe('Request timed out');
  });
});
