const ValidationError = require('../../src/errors/ValidationError');

describe('ValidationError', () => {
  it('should create error with default message', () => {
    const error = new ValidationError();
    expect(error.message).toBe('Validation failed');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.isOperational).toBe(true);
  });

  it('should create error with custom message', () => {
    const error = new ValidationError('Custom validation error');
    expect(error.message).toBe('Custom validation error');
  });

  it('should include details when provided', () => {
    const details = [{ field: 'email', message: 'Invalid email' }];
    const error = new ValidationError('Validation failed', details);
    expect(error.details).toEqual(details);
  });

  it('should exclude details when not provided', () => {
    const error = new ValidationError('Validation failed');
    expect(error.details).toBe(null);
  });

  describe('toJSON', () => {
    it('should include details in JSON when present', () => {
      const details = [{ field: 'email', message: 'Invalid email' }];
      const error = new ValidationError('Validation failed', details);
      const json = error.toJSON();

      expect(json.error.details).toEqual(details);
    });

    it('should exclude details from JSON when null', () => {
      const error = new ValidationError('Validation failed', null);
      const json = error.toJSON();

      expect(json.error.details).toBeUndefined();
    });

    it('should exclude details from JSON when not set', () => {
      const error = new ValidationError('Validation failed');
      const json = error.toJSON();

      expect(json.error.details).toBeUndefined();
    });

    it('should include object details', () => {
      const details = { field: 'id', value: 'invalid' };
      const error = new ValidationError('Validation failed', details);
      const json = error.toJSON();

      expect(json.error.details).toEqual(details);
    });
  });
});
