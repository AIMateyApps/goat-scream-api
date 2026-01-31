const NotFoundError = require('../../src/errors/NotFoundError');

describe('NotFoundError', () => {
  it('should create error with default message', () => {
    const error = new NotFoundError();
    expect(error.message).toBe('Resource not found');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.isOperational).toBe(true);
  });

  it('should create error with custom message', () => {
    const error = new NotFoundError('Custom not found message');
    expect(error.message).toBe('Custom not found message');
  });

  it('should include resource when provided', () => {
    const error = new NotFoundError('Resource not found', 'scream');
    expect(error.resource).toBe('scream');
  });

  it('should exclude resource when not provided', () => {
    const error = new NotFoundError('Resource not found');
    expect(error.resource).toBe(null);
  });

  describe('toJSON', () => {
    it('should include resource in JSON when present', () => {
      const error = new NotFoundError('Resource not found', 'scream');
      const json = error.toJSON();

      expect(json.error.resource).toBe('scream');
    });

    it('should exclude resource from JSON when null', () => {
      const error = new NotFoundError('Resource not found', null);
      const json = error.toJSON();

      expect(json.error.resource).toBeUndefined();
    });

    it('should exclude resource from JSON when not set', () => {
      const error = new NotFoundError('Resource not found');
      const json = error.toJSON();

      expect(json.error.resource).toBeUndefined();
    });
  });
});
