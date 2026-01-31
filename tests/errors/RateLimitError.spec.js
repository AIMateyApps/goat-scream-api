const RateLimitError = require('../../src/errors/RateLimitError');

describe('RateLimitError', () => {
  it('should create error with default message', () => {
    const error = new RateLimitError();
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(error.isOperational).toBe(true);
  });

  it('should include quota when provided', () => {
    const error = new RateLimitError('Rate limit exceeded', 100);
    expect(error.quota).toBe(100);
  });

  it('should include windowMs when provided', () => {
    const error = new RateLimitError('Rate limit exceeded', 100, 60000);
    expect(error.windowMs).toBe(60000);
  });

  describe('toJSON', () => {
    it('should include quota in JSON when not null', () => {
      const error = new RateLimitError('Rate limit exceeded', 100);
      const json = error.toJSON();

      expect(json.error.quota).toBe(100);
    });

    it('should exclude quota from JSON when null', () => {
      const error = new RateLimitError('Rate limit exceeded', null);
      const json = error.toJSON();

      expect(json.error.quota).toBeUndefined();
    });

    it('should include windowMs in JSON when not null', () => {
      const error = new RateLimitError('Rate limit exceeded', 100, 60000);
      const json = error.toJSON();

      expect(json.error.window_ms).toBe(60000);
    });

    it('should exclude windowMs from JSON when null', () => {
      const error = new RateLimitError('Rate limit exceeded', 100, null);
      const json = error.toJSON();

      expect(json.error.window_ms).toBeUndefined();
    });

    it('should handle quota of 0 (should be included)', () => {
      const error = new RateLimitError('Rate limit exceeded', 0);
      const json = error.toJSON();

      expect(json.error.quota).toBe(0);
    });
  });
});
