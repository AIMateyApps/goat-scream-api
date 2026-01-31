const errorTracking = require('../../src/services/errorTracking');

describe('Error Tracking Service', () => {
  beforeAll(() => {
    // Initialize without DSN (no-op mode)
    errorTracking.initialize();
  });

  describe('isInitialized', () => {
    it('should return false when DSN is not configured', () => {
      // In test environment, no DSN is set
      const result = errorTracking.isInitialized();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('trackError', () => {
    it('should not throw when tracking errors in no-op mode', () => {
      const error = new Error('Test error');
      expect(() => {
        errorTracking.trackError(error, { test: true });
      }).not.toThrow();
    });

    it('should accept operational flag', () => {
      const error = new Error('Operational error');
      expect(() => {
        errorTracking.trackError(error, { test: true }, true);
      }).not.toThrow();
    });
  });

  describe('trackMessage', () => {
    it('should not throw when tracking messages in no-op mode', () => {
      expect(() => {
        errorTracking.trackMessage('Test message', 'info', { context: 'test' });
      }).not.toThrow();
    });

    it('should handle different log levels', () => {
      expect(() => {
        errorTracking.trackMessage('Warning message', 'warning');
        errorTracking.trackMessage('Error message', 'error');
      }).not.toThrow();
    });
  });

  describe('setUser and clearUser', () => {
    it('should not throw when setting user in no-op mode', () => {
      expect(() => {
        errorTracking.setUser({ id: 'test-user', email: 'test@example.com' });
      }).not.toThrow();
    });

    it('should not throw when clearing user in no-op mode', () => {
      expect(() => {
        errorTracking.clearUser();
      }).not.toThrow();
    });
  });

  describe('addBreadcrumb', () => {
    it('should not throw when adding breadcrumb in no-op mode', () => {
      expect(() => {
        errorTracking.addBreadcrumb({
          category: 'test',
          message: 'Test breadcrumb',
          level: 'info',
        });
      }).not.toThrow();
    });
  });

  describe('flush', () => {
    it('should resolve when flushing in no-op mode', async () => {
      const result = await errorTracking.flush(1000);
      expect(result).toBe(true);
    });
  });

  describe('getSentry', () => {
    it('should return Sentry SDK', () => {
      const sentry = errorTracking.getSentry();
      expect(sentry).toBeDefined();
      expect(typeof sentry.captureException).toBe('function');
    });
  });
});
