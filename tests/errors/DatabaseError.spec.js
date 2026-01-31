const DatabaseError = require('../../src/errors/DatabaseError');

describe('DatabaseError', () => {
  it('should create error with default message', () => {
    const error = new DatabaseError();
    expect(error.message).toBe('Database operation failed');
    expect(error.statusCode).toBe(503);
    expect(error.code).toBe('DATABASE_ERROR');
    expect(error.isOperational).toBe(true);
  });

  it('should include operation when provided', () => {
    const error = new DatabaseError('Database error', 'find');
    expect(error.operation).toBe('find');
  });

  it('should exclude operation when not provided', () => {
    const error = new DatabaseError('Database error');
    expect(error.operation).toBe(null);
  });

  describe('toJSON', () => {
    it('should include operation in JSON when present', () => {
      const error = new DatabaseError('Database error', 'find');
      const json = error.toJSON();

      expect(json.error.operation).toBe('find');
    });

    it('should exclude operation from JSON when null', () => {
      const error = new DatabaseError('Database error', null);
      const json = error.toJSON();

      expect(json.error.operation).toBeUndefined();
    });

    it('should exclude operation from JSON when not set', () => {
      const error = new DatabaseError('Database error');
      const json = error.toJSON();

      expect(json.error.operation).toBeUndefined();
    });

    it('should exclude operation from JSON when empty string', () => {
      const error = new DatabaseError('Database error', '');
      const json = error.toJSON();

      // Empty string is falsy, so it should be excluded (undefined)
      expect(json.error.operation).toBeUndefined();
    });
  });
});
