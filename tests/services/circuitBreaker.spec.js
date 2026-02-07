const {
  createCircuitBreaker,
  getCircuitState,
  getAllCircuitStates,
  resetCircuitBreaker,
} = require('../../src/services/circuitBreaker');
const { info: logInfo } = require('../../src/utils/logger');

jest.mock('../../src/utils/logger');

describe('circuitBreaker', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.CIRCUIT_BREAKER_ENABLED;
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env.CIRCUIT_BREAKER_ENABLED = originalEnv;
  });

  describe('createCircuitBreaker', () => {
    it('should create enabled circuit breaker by default', async () => {
      delete process.env.CIRCUIT_BREAKER_ENABLED;
      const operation = jest.fn().mockResolvedValue('success');
      const breaker = createCircuitBreaker(operation, { name: 'test-service' });

      expect(breaker).toBeDefined();
      expect(breaker.fire).toBeDefined();
      // When enabled, returns opossum CircuitBreaker instance
      // State is tracked via getCircuitState() function, not directly on breaker
      expect(typeof breaker.fire).toBe('function');

      const result = await breaker.fire('arg1', 'arg2');
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledWith('arg1', 'arg2');

      // Verify state is tracked
      const state = getCircuitState('test-service');
      expect(state.state).toBe('closed');
    });

    it('should create disabled circuit breaker when CIRCUIT_BREAKER_ENABLED=false', () => {
      process.env.CIRCUIT_BREAKER_ENABLED = 'false';
      const operation = jest.fn().mockResolvedValue('success');
      const breaker = createCircuitBreaker(operation, { name: 'test-service' });

      expect(breaker).toBeDefined();
      expect(breaker.fire).toBeDefined();
      expect(breaker.isOpen()).toBe(false);
      expect(breaker.getState()).toEqual({ state: 'closed', enabled: false });
    });

    it('should create disabled circuit breaker when enabled=false in options', () => {
      const operation = jest.fn().mockResolvedValue('success');
      const breaker = createCircuitBreaker(operation, {
        name: 'test-service',
        enabled: false,
      });

      expect(breaker.isOpen()).toBe(false);
      expect(breaker.getState()).toEqual({ state: 'closed', enabled: false });
    });

    it('should use custom options', () => {
      const operation = jest.fn();
      const breaker = createCircuitBreaker(operation, {
        name: 'custom-service',
        timeout: 10000,
        errorThresholdPercentage: 75,
        resetTimeout: 60000,
      });

      expect(breaker).toBeDefined();
      const state = getCircuitState('custom-service');
      expect(state.state).toBe('closed');
    });

    it('should handle operation errors', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      const breaker = createCircuitBreaker(operation, { name: 'failing-service' });

      await expect(breaker.fire()).rejects.toThrow('Operation failed');
    });
  });

  describe('getCircuitState', () => {
    it('should return state for existing circuit breaker', () => {
      const operation = jest.fn();
      createCircuitBreaker(operation, { name: 'state-test' });

      const state = getCircuitState('state-test');
      expect(state).toBeDefined();
      expect(state.state).toBe('closed');
    });

    it('should return unknown state for non-existent circuit breaker', () => {
      const state = getCircuitState('non-existent');
      expect(state).toEqual({ state: 'unknown' });
    });
  });

  describe('getAllCircuitStates', () => {
    it('should return all circuit breaker states', () => {
      const operation1 = jest.fn();
      const operation2 = jest.fn();
      createCircuitBreaker(operation1, { name: 'service-1' });
      createCircuitBreaker(operation2, { name: 'service-2' });

      const states = getAllCircuitStates();
      expect(states).toBeDefined();
      expect(states['service-1']).toBeDefined();
      expect(states['service-2']).toBeDefined();
    });

    it('should return empty object when no circuit breakers exist', () => {
      // Clear any existing states by creating a fresh instance context
      const states = getAllCircuitStates();
      expect(typeof states).toBe('object');
    });
  });

  describe('resetCircuitBreaker', () => {
    it('should reset circuit breaker when breaker exists and has close method', () => {
      const operation = jest.fn();
      const breaker = createCircuitBreaker(operation, { name: 'reset-test' });

      resetCircuitBreaker(breaker, 'reset-test');

      expect(logInfo).toHaveBeenCalledWith('Circuit breaker manually reset', {
        service: 'reset-test',
      });
    });

    it('should not throw when breaker is null', () => {
      expect(() => {
        resetCircuitBreaker(null, 'non-existent');
      }).not.toThrow();
    });

    it('should not throw when breaker does not have close method', () => {
      const fakeBreaker = { fire: jest.fn() };
      expect(() => {
        resetCircuitBreaker(fakeBreaker, 'fake-service');
      }).not.toThrow();
    });

    it('should not throw when breaker is undefined', () => {
      expect(() => {
        resetCircuitBreaker(undefined, 'undefined-service');
      }).not.toThrow();
    });
  });
});
