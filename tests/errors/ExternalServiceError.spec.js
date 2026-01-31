const ExternalServiceError = require('../../src/errors/ExternalServiceError');

describe('ExternalServiceError', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should create error with default message', () => {
    const error = new ExternalServiceError();
    expect(error.message).toBe('External service error');
    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
    expect(error.isOperational).toBe(true);
  });

  it('should include service when provided', () => {
    const error = new ExternalServiceError('Service error', 'cloudinary');
    expect(error.service).toBe('cloudinary');
  });

  it('should include originalError when provided', () => {
    const originalError = new Error('Original error');
    const error = new ExternalServiceError('Service error', 'cloudinary', originalError);
    expect(error.originalError).toBe(originalError);
  });

  describe('toJSON', () => {
    it('should include service in JSON when present', () => {
      const error = new ExternalServiceError('Service error', 'cloudinary');
      const json = error.toJSON();

      expect(json.error.service).toBe('cloudinary');
    });

    it('should exclude service from JSON when null', () => {
      const error = new ExternalServiceError('Service error', null);
      const json = error.toJSON();

      expect(json.error.service).toBeUndefined();
    });

    it('should include original_error in development when present', () => {
      process.env.NODE_ENV = 'development';
      const originalError = new Error('Original error message');
      const error = new ExternalServiceError('Service error', 'cloudinary', originalError);
      const json = error.toJSON();

      expect(json.error.original_error).toBe('Original error message');
    });

    it('should exclude original_error in production', () => {
      process.env.NODE_ENV = 'production';
      const originalError = new Error('Original error message');
      const error = new ExternalServiceError('Service error', 'cloudinary', originalError);
      const json = error.toJSON();

      expect(json.error.original_error).toBeUndefined();
    });

    it('should exclude original_error when not provided', () => {
      process.env.NODE_ENV = 'development';
      const error = new ExternalServiceError('Service error', 'cloudinary');
      const json = error.toJSON();

      expect(json.error.original_error).toBeUndefined();
    });

    it('should exclude original_error in test environment', () => {
      process.env.NODE_ENV = 'test';
      const originalError = new Error('Original error message');
      const error = new ExternalServiceError('Service error', 'cloudinary', originalError);
      const json = error.toJSON();

      expect(json.error.original_error).toBeUndefined();
    });
  });
});
