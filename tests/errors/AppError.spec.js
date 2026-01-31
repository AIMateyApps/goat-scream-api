const AppError = require('../../src/errors/AppError');

describe('AppError', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('constructor', () => {
    it('should create error with default values', () => {
      const error = new AppError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.requestId).toBe(null);
      expect(error.name).toBe('AppError');
    });

    it('should create error with custom values', () => {
      const error = new AppError('Custom error', 404, 'NOT_FOUND', false);
      expect(error.message).toBe('Custom error');
      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.isOperational).toBe(false);
    });

    it('should capture stack trace if available', () => {
      const error = new AppError('Test error');
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });
  });

  describe('toJSON', () => {
    it('should return basic error object', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR');
      const json = error.toJSON();

      expect(json).toEqual({
        error: {
          code: 'TEST_ERROR',
          message: 'Test error',
        },
      });
    });

    it('should include requestId when set', () => {
      const error = new AppError('Test error');
      error.requestId = 'test-request-id';
      const json = error.toJSON();

      expect(json.error.request_id).toBe('test-request-id');
    });

    it('should exclude requestId when not set', () => {
      const error = new AppError('Test error');
      const json = error.toJSON();

      expect(json.error.request_id).toBeUndefined();
    });

    it('should include stack trace in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new AppError('Test error');
      const json = error.toJSON();

      expect(json.error.stack).toBeDefined();
      expect(typeof json.error.stack).toBe('string');
    });

    it('should exclude stack trace in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new AppError('Test error');
      const json = error.toJSON();

      expect(json.error.stack).toBeUndefined();
    });

    it('should exclude stack trace in test environment', () => {
      process.env.NODE_ENV = 'test';
      const error = new AppError('Test error');
      const json = error.toJSON();

      expect(json.error.stack).toBeUndefined();
    });

    it('should exclude stack trace when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      const error = new AppError('Test error');
      const json = error.toJSON();

      expect(json.error.stack).toBeUndefined();
    });
  });
});
