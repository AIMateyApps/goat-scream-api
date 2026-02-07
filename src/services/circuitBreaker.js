const CircuitBreaker = require('opossum');
const { warn: logWarn, error: logError, info: logInfo } = require('../utils/logger');

// Circuit breaker state tracking
const circuitStates = new Map();

/**
 * Create a circuit breaker for a service
 *
 * @param {Function} operation - The async function to wrap
 * @param {Object} options - Circuit breaker options
 * @returns {CircuitBreaker} Configured circuit breaker instance
 */
function createCircuitBreaker(operation, options = {}) {
  const {
    name = 'unknown',
    timeout = 5000, // 5 seconds
    errorThresholdPercentage = 50, // Open circuit after 50% failures
    resetTimeout = 30000, // 30 seconds before attempting to close
    enabled = process.env.CIRCUIT_BREAKER_ENABLED !== 'false',
  } = options;

  // If circuit breaker is disabled, just return the operation wrapped in a promise
  if (!enabled) {
    return {
      fire: (...args) => Promise.resolve(operation(...args)),
      isOpen: () => false,
      getState: () => ({ state: 'closed', enabled: false }),
    };
  }

  const breakerOptions = {
    timeout,
    errorThresholdPercentage,
    resetTimeout,
    name,
  };

  const breaker = new CircuitBreaker(operation, breakerOptions);

  // Track state changes
  breaker.on('open', () => {
    logWarn('Circuit breaker opened', { service: name });
    circuitStates.set(name, { state: 'open', openedAt: new Date() });
  });

  breaker.on('halfOpen', () => {
    logInfo('Circuit breaker half-open', { service: name });
    circuitStates.set(name, { state: 'halfOpen', halfOpenedAt: new Date() });
  });

  breaker.on('close', () => {
    logInfo('Circuit breaker closed', { service: name });
    circuitStates.set(name, { state: 'closed', closedAt: new Date() });
  });

  breaker.on('failure', err => {
    logError('Circuit breaker failure', { service: name, error: err.message });
  });

  breaker.on('reject', err => {
    logWarn('Circuit breaker rejected (open)', { service: name, error: err.message });
  });

  breaker.on('timeout', err => {
    logWarn('Circuit breaker timeout', { service: name, error: err.message });
  });

  // Initialize state
  circuitStates.set(name, { state: 'closed' });

  return breaker;
}

/**
 * Get circuit breaker state for a service
 */
function getCircuitState(name) {
  return circuitStates.get(name) || { state: 'unknown' };
}

/**
 * Get all circuit breaker states
 */
function getAllCircuitStates() {
  const states = {};
  circuitStates.forEach((state, name) => {
    states[name] = state;
  });
  return states;
}

/**
 * Reset a circuit breaker
 */
function resetCircuitBreaker(breaker, name) {
  if (breaker && typeof breaker.close === 'function') {
    breaker.close();
    logInfo('Circuit breaker manually reset', { service: name });
  }
}

module.exports = {
  createCircuitBreaker,
  getCircuitState,
  getAllCircuitStates,
  resetCircuitBreaker,
};
