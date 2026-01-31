const request = require('supertest');
const express = require('express');
const mongoose = require('mongoose');
const errorHandler = require('../../src/middleware/errorHandler');
const { AppError, ValidationError, NotFoundError, RateLimitError } = require('../../src/errors');
const errorTracking = require('../../src/services/errorTracking');
const { warn: logWarn, error: logError } = require('../../src/utils/logger');

// Mock error tracking and logging
jest.mock('../../src/services/errorTracking');
jest.mock('../../src/utils/logger');

describe('errorHandler middleware', () => {
  let app;
  let originalEnv;

  beforeEach(() => {
    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());

    // Mock request ID middleware
    app.use((req, res, next) => {
      req.requestId = 'test-request-id';
      req.originalUrl = '/test/route';
      req.method = 'GET';
      req.ip = '127.0.0.1';
      next();
    });

    // Store original NODE_ENV
    originalEnv = process.env.NODE_ENV;

    // Clear mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore NODE_ENV
    process.env.NODE_ENV = originalEnv;
  });

  describe('AppError handling', () => {
    it('should handle AppError with requestId', async () => {
      app.get('/test', (req, res, next) => {
        const err = new ValidationError('Test validation error');
        next(err);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(400);

      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Test validation error',
        request_id: 'test-request-id',
      });
      expect(errorTracking.trackError).toHaveBeenCalled();
    });

    it('should handle AppError without requestId on request', async () => {
      app.use((req, res, next) => {
        delete req.requestId;
        next();
      });
      app.get('/test', (req, res, next) => {
        const err = new NotFoundError('Resource not found');
        next(err);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(404);

      expect(res.body.error).toMatchObject({
        code: 'NOT_FOUND',
        message: 'Resource not found',
        request_id: 'unknown',
      });
    });

    it('should handle operational AppError (warns)', async () => {
      app.get('/test', (req, res, next) => {
        const err = new ValidationError('Test error', null);
        err.isOperational = true;
        next(err);
      });
      app.use(errorHandler);

      await request(app).get('/test').expect(400);

      expect(logWarn).toHaveBeenCalled();
      expect(logError).not.toHaveBeenCalled();
    });

    it('should handle non-operational AppError (errors)', async () => {
      app.get('/test', (req, res, next) => {
        const err = new AppError('Test error', 500, 'TEST_ERROR', false);
        next(err);
      });
      app.use(errorHandler);

      await request(app).get('/test').expect(500);

      expect(logError).toHaveBeenCalled();
      expect(logWarn).not.toHaveBeenCalled();
    });

    it('should use default statusCode 500 if not set', async () => {
      app.get('/test', (req, res, next) => {
        const err = new AppError('Test error');
        err.statusCode = undefined;
        next(err);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(500);

      expect(res.body.error.statusCode).toBeUndefined();
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });

    it('should include stack trace in development', async () => {
      process.env.NODE_ENV = 'development';
      app.get('/test', (req, res, next) => {
        const err = new ValidationError('Test error');
        next(err);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(400);

      expect(res.body.error.stack).toBeDefined();
      expect(typeof res.body.error.stack).toBe('string');
    });

    it('should exclude stack trace in production', async () => {
      process.env.NODE_ENV = 'production';
      app.get('/test', (req, res, next) => {
        const err = new ValidationError('Test error');
        next(err);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(400);

      expect(res.body.error.stack).toBeUndefined();
    });

    it('should include stack trace in log for non-operational errors in development', async () => {
      process.env.NODE_ENV = 'development';
      app.get('/test', (req, res, next) => {
        const err = new AppError('Test error', 500, 'TEST_ERROR', false);
        next(err);
      });
      app.use(errorHandler);

      await request(app).get('/test').expect(500);

      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          stack: expect.any(String),
        })
      );
    });

    it('should exclude stack trace in log for non-operational errors in production', async () => {
      process.env.NODE_ENV = 'production';
      app.get('/test', (req, res, next) => {
        const err = new AppError('Test error', 500, 'TEST_ERROR', false);
        next(err);
      });
      app.use(errorHandler);

      await request(app).get('/test').expect(500);

      expect(logError).toHaveBeenCalledWith(
        expect.not.objectContaining({
          stack: expect.anything(),
        })
      );
    });

    it('should handle isOperational === false explicitly', async () => {
      app.get('/test', (req, res, next) => {
        const err = new AppError('Test error', 500, 'TEST_ERROR', false);
        err.isOperational = false;
        next(err);
      });
      app.use(errorHandler);

      await request(app).get('/test').expect(500);

      expect(logError).toHaveBeenCalled();
    });

    it('should handle isOperational === undefined (defaults to true)', async () => {
      app.get('/test', (req, res, next) => {
        const err = new AppError('Test error', 400, 'TEST_ERROR');
        delete err.isOperational;
        next(err);
      });
      app.use(errorHandler);

      await request(app).get('/test').expect(400);

      // When isOperational is undefined, it defaults to true
      expect(logWarn).toHaveBeenCalled();
    });
  });

  describe('Mongoose error conversion', () => {
    it('should convert Mongoose ValidationError to ValidationError', async () => {
      app.get('/test', (req, res, next) => {
        const mongooseError = new mongoose.Error.ValidationError();
        mongooseError.errors = {
          name: { path: 'name', message: 'Name is required' },
          email: { path: 'email', message: 'Email is invalid' },
        };
        next(mongooseError);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(400);

      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        request_id: 'test-request-id',
      });
      expect(res.body.error.details).toEqual([
        { field: 'name', message: 'Name is required' },
        { field: 'email', message: 'Email is invalid' },
      ]);
    });

    it('should convert Mongoose CastError to ValidationError', async () => {
      app.get('/test', (req, res, next) => {
        const castError = new mongoose.Error.CastError('ObjectId', 'invalid-id', 'id');
        castError.path = 'id';
        castError.value = 'invalid-id';
        next(castError);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(400);

      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Invalid id: invalid-id',
        request_id: 'test-request-id',
      });
      expect(res.body.error.details).toEqual({
        field: 'id',
        value: 'invalid-id',
      });
    });

    it('should handle Mongoose ValidationError without errors object', async () => {
      app.get('/test', (req, res, next) => {
        const mongooseError = new mongoose.Error.ValidationError();
        mongooseError.errors = {};
        next(mongooseError);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(400);

      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
      });
      expect(res.body.error.details).toEqual([]);
    });
  });

  describe('Unknown error handling', () => {
    it('should handle generic Error objects', async () => {
      app.get('/test', (req, res, next) => {
        next(new Error('Generic error'));
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(500);

      expect(res.body.error).toMatchObject({
        code: 'INTERNAL_ERROR',
        request_id: 'test-request-id',
      });
      expect(errorTracking.trackError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          status_code: 500,
          error_type: 'UNKNOWN_ERROR',
        }),
        false
      );
    });

    it('should handle unknown errors in development (show message)', async () => {
      process.env.NODE_ENV = 'development';
      app.get('/test', (req, res, next) => {
        next(new Error('Test unknown error'));
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(500);

      expect(res.body.error.message).toBe('Test unknown error');
      expect(res.body.error.stack).toBeDefined();
    });

    it('should handle unknown errors in production (hide message)', async () => {
      process.env.NODE_ENV = 'production';
      app.get('/test', (req, res, next) => {
        next(new Error('Test unknown error'));
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(500);

      expect(res.body.error.message).toBe('An unexpected error occurred');
      expect(res.body.error.stack).toBeUndefined();
    });

    it('should include stack trace for unknown errors in development', async () => {
      process.env.NODE_ENV = 'development';
      app.get('/test', (req, res, next) => {
        next(new Error('Test error'));
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(500);

      expect(res.body.error.stack).toBeDefined();
    });

    it('should exclude stack trace for unknown errors in production', async () => {
      process.env.NODE_ENV = 'production';
      app.get('/test', (req, res, next) => {
        next(new Error('Test error'));
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(500);

      expect(res.body.error.stack).toBeUndefined();
    });

    it('should log unknown errors with full context', async () => {
      app.get('/test', (req, res, next) => {
        const err = new Error('Test error');
        err.name = 'CustomError';
        next(err);
      });
      app.use(errorHandler);

      await request(app).get('/test').expect(500);

      expect(logError).toHaveBeenCalledWith(
        expect.objectContaining({
          request_id: 'test-request-id',
          method: 'GET',
          path: '/test/route',
          status_code: 500,
          error_name: 'CustomError',
          error_message: 'Test error',
        })
      );
    });
  });

  describe('Error tracking', () => {
    it('should track AppError with correct context', async () => {
      app.get('/test', (req, res, next) => {
        const err = new RateLimitError('Too many requests');
        next(err);
      });
      app.use(errorHandler);

      await request(app).get('/test').expect(429);

      expect(errorTracking.trackError).toHaveBeenCalledWith(
        expect.any(RateLimitError),
        expect.objectContaining({
          request_id: 'test-request-id',
          route: '/test/route',
          method: 'GET',
          // IP can be IPv4 or IPv6-mapped IPv4 (::ffff:127.0.0.1)
          ip: expect.stringMatching(/^(127\.0\.0\.1|::ffff:127\.0\.0\.1)$/),
          status_code: 429,
          error_code: 'RATE_LIMIT_EXCEEDED',
          is_operational: true,
        }),
        true
      );
    });

    it('should track unknown errors as non-operational', async () => {
      app.get('/test', (req, res, next) => {
        next(new Error('Unknown error'));
      });
      app.use(errorHandler);

      await request(app).get('/test').expect(500);

      expect(errorTracking.trackError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          status_code: 500,
          error_type: 'UNKNOWN_ERROR',
        }),
        false
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle error without stack property', async () => {
      app.get('/test', (req, res, next) => {
        const err = { message: 'Error without stack', name: 'Error' };
        next(err);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(500);

      expect(res.body.error.code).toBe('INTERNAL_ERROR');
    });

    it('should handle error with null message', async () => {
      app.get('/test', (req, res, next) => {
        const err = new Error();
        err.message = null;
        next(err);
      });
      app.use(errorHandler);

      await request(app).get('/test').expect(500);

      expect(errorTracking.trackError).toHaveBeenCalled();
    });

    it('should handle ValidationError with details', async () => {
      app.get('/test', (req, res, next) => {
        const err = new ValidationError('Validation failed', [
          { field: 'email', message: 'Invalid email' },
        ]);
        next(err);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(400);

      expect(res.body.error.details).toEqual([{ field: 'email', message: 'Invalid email' }]);
    });

    it('should handle ValidationError without details', async () => {
      app.get('/test', (req, res, next) => {
        const err = new ValidationError('Validation failed');
        next(err);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test').expect(400);

      expect(res.body.error.details).toBeUndefined();
    });
  });
});
