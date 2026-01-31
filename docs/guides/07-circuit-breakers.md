# Circuit Breakers: Surviving External Failures

When Cloudinary is down, should your entire API fail? Circuit breakers prevent cascading failures by detecting unhealthy dependencies and failing fast rather than waiting for timeouts.

## Mental Model

A circuit breaker has three states, like an electrical circuit:

```
                    CLOSED
                 (normal operation)
                       │
          Failures exceed threshold
                       ↓
                     OPEN
            (fail immediately, no calls)
                       │
                Reset timeout expires
                       ↓
                  HALF-OPEN
            (allow one test request)
                       │
          ┌───────────┴───────────┐
      Success                  Failure
          ↓                        ↓
       CLOSED                    OPEN
```

**Closed**: Normal operation. Track failures.
**Open**: Reject immediately. Don't waste time on a broken service.
**Half-Open**: Try one request. If it succeeds, close. If it fails, reopen.

## Copy This Pattern

```javascript
// services/circuitBreaker.js
const CircuitBreaker = require('opossum');

const circuitStates = new Map();

function createCircuitBreaker(operation, options = {}) {
  const {
    name = 'unknown',
    timeout = 5000, // Fail after 5s
    errorThresholdPercentage = 50, // Open after 50% failures
    resetTimeout = 30000, // Try again after 30s
  } = options;

  const breaker = new CircuitBreaker(operation, {
    timeout,
    errorThresholdPercentage,
    resetTimeout,
    name,
  });

  // Track state changes
  breaker.on('open', () => {
    console.warn(`Circuit breaker OPENED: ${name}`);
    circuitStates.set(name, { state: 'open', openedAt: new Date() });
  });

  breaker.on('halfOpen', () => {
    console.info(`Circuit breaker HALF-OPEN: ${name}`);
    circuitStates.set(name, { state: 'halfOpen' });
  });

  breaker.on('close', () => {
    console.info(`Circuit breaker CLOSED: ${name}`);
    circuitStates.set(name, { state: 'closed', closedAt: new Date() });
  });

  breaker.on('failure', err => {
    console.error(`Circuit breaker failure: ${name}`, err.message);
  });

  breaker.on('reject', () => {
    console.warn(`Circuit breaker rejected (open): ${name}`);
  });

  breaker.on('timeout', () => {
    console.warn(`Circuit breaker timeout: ${name}`);
  });

  circuitStates.set(name, { state: 'closed' });

  return breaker;
}

function getCircuitState(name) {
  return circuitStates.get(name) || { state: 'unknown' };
}

function getAllCircuitStates() {
  const states = {};
  circuitStates.forEach((state, name) => {
    states[name] = state;
  });
  return states;
}

module.exports = {
  createCircuitBreaker,
  getCircuitState,
  getAllCircuitStates,
};
```

```javascript
// Usage in a repository
const { createCircuitBreaker } = require('../services/circuitBreaker');

let cloudinaryBreaker = null;

function getCloudinaryBreaker() {
  if (!cloudinaryBreaker) {
    cloudinaryBreaker = createCircuitBreaker(async operation => operation(), {
      name: 'cloudinary',
      timeout: 10000,
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
    });
  }
  return cloudinaryBreaker;
}

async function uploadWithCircuitBreaker(file) {
  const breaker = getCloudinaryBreaker();

  return breaker.fire(async () => {
    return cloudinary.upload(file);
  });
}
```

## In This Repo

**Circuit breaker factory:** `src/services/circuitBreaker.js:14-73`

Creates configured circuit breakers with event logging:

```javascript
function createCircuitBreaker(operation, options = {}) {
  const {
    name = 'unknown',
    timeout = 5000,
    errorThresholdPercentage = 50,
    resetTimeout = 30000,
    enabled = process.env.CIRCUIT_BREAKER_ENABLED !== 'false',
  } = options;

  if (!enabled) {
    // Bypass when disabled
    return {
      fire: (...args) => Promise.resolve(operation(...args)),
      isOpen: () => false,
    };
  }

  const breaker = new CircuitBreaker(operation, breakerOptions);

  // State change logging
  breaker.on('open', () => {
    logWarn('Circuit breaker opened', { service: name });
    circuitStates.set(name, { state: 'open', openedAt: new Date() });
  });
  // ... more event handlers
}
```

**MongoDB circuit breaker:** `src/repositories/mongoScreamsRepository.js:11-32`

```javascript
function initializeCircuitBreaker() {
  if (mongoBreaker) return mongoBreaker;

  mongoBreaker = createCircuitBreaker(async operation => operation(), {
    name: 'mongodb',
    timeout: parseInt(process.env.MONGO_CIRCUIT_TIMEOUT || '10000', 10),
    errorThresholdPercentage: parseInt(process.env.MONGO_CIRCUIT_ERROR_THRESHOLD || '50', 10),
    resetTimeout: parseInt(process.env.MONGO_CIRCUIT_RESET_TIMEOUT || '30000', 10),
  });

  return mongoBreaker;
}

async function withCircuitBreaker(operation) {
  const breaker = initializeCircuitBreaker();
  return breaker.fire(operation);
}
```

**Usage in repository methods:** `src/repositories/mongoScreamsRepository.js:56-72`

```javascript
async find(filter, options = {}) {
  return withCircuitBreaker(async () => {
    let query = GoatScream.find(filter, projection).lean();
    // ... build query
    return query.exec();
  });
}
```

**Readiness probe integration:** `src/app.js:186-192`

```javascript
let circuitBreakers = null;
try {
  const { getAllCircuitStates } = require('./services/circuitBreaker');
  circuitBreakers = getAllCircuitStates();
} catch {
  // Circuit breakers not initialized
}
```

**Search pattern:** `grep -rn "circuitBreaker\|withCircuitBreaker" src/`

## Try It

Simulate failures to watch the circuit breaker open:

1. **Create a test breaker:**

   ```javascript
   // test-circuit.js
   const { createCircuitBreaker } = require('./src/services/circuitBreaker');

   let failureRate = 0.8; // 80% failure rate

   const operation = async () => {
     if (Math.random() < failureRate) {
       throw new Error('Simulated failure');
     }
     return 'success';
   };

   const breaker = createCircuitBreaker(operation, {
     name: 'test-service',
     timeout: 1000,
     errorThresholdPercentage: 50,
     resetTimeout: 5000,
   });

   async function makeRequests() {
     for (let i = 0; i < 20; i++) {
       try {
         const result = await breaker.fire();
         console.log(`Request ${i + 1}: ${result}`);
       } catch (err) {
         console.log(`Request ${i + 1}: ${err.message}`);
       }
       await new Promise(r => setTimeout(r, 200));
     }

     console.log('\nWaiting for reset timeout...\n');
     await new Promise(r => setTimeout(r, 6000));

     // Simulate recovery
     failureRate = 0;
     console.log('Service recovered, trying again:\n');

     for (let i = 0; i < 5; i++) {
       try {
         const result = await breaker.fire();
         console.log(`Request ${i + 1}: ${result}`);
       } catch (err) {
         console.log(`Request ${i + 1}: ${err.message}`);
       }
       await new Promise(r => setTimeout(r, 200));
     }
   }

   makeRequests();
   ```

2. **Run the test:**

   ```bash
   node test-circuit.js
   ```

3. **Watch the state transitions:**
   - First few requests: mix of success/failure
   - After ~50% failures: "Circuit breaker OPENED"
   - Next requests: "Breaker is open" (rejected immediately)
   - After 5s: "Circuit breaker HALF-OPEN"
   - Test request succeeds: "Circuit breaker CLOSED"

4. **Check circuit states via readiness endpoint:**
   ```bash
   curl -s "http://localhost:3000/ready" | jq '.circuit_breakers'
   ```

## Debugging Checklist

| Symptom                            | Check                                                           |
| ---------------------------------- | --------------------------------------------------------------- |
| Circuit never opens                | `errorThresholdPercentage` too high? Enough requests in window? |
| Circuit stays open forever         | `resetTimeout` too long? Service actually down?                 |
| All requests fail during half-open | Failure rate still high? Need longer resetTimeout               |
| Circuit breaker not used           | `withCircuitBreaker` wrapper missing on operations?             |
| "Breaker is open" errors           | Expected! This means protection is working                      |
| State not reflected in /ready      | `getAllCircuitStates()` called correctly?                       |

## FAQ

**Q: What's a good error threshold?**

A: Start with 50%. If a service fails half the time, it's probably experiencing issues. Lower thresholds (25%) react faster but may open on temporary blips. Higher thresholds (75%) are more tolerant but delay protection.

**Q: What's a good timeout?**

A: Longer than your service's P99 latency. If 99% of requests complete in 2s, set timeout to 5s to avoid false positives. Too short = legitimate slow requests trigger failures.

**Q: What's a good reset timeout?**

A: Depends on typical recovery time. 30 seconds is a good start. If your service takes minutes to recover, increase it to avoid hammering a struggling service.

**Q: Should every external call use a circuit breaker?**

A: Critical dependencies (database, primary storage) yes. Optional features (analytics, feature flags) can fail silently without circuit breakers. Prioritize based on impact.

**Q: How do I test circuit breakers?**

A: Use Opossum's built-in test utilities or inject failure functions. You can also manually trigger `breaker.open()` in tests to verify fallback behavior.

## Further Reading

- Opossum: [Circuit Breaker Library](https://nodeshift.dev/opossum/)
- Martin Fowler: [Circuit Breaker](https://martinfowler.com/bliki/CircuitBreaker.html)
- Netflix: [Hystrix (inspiration)](https://github.com/Netflix/Hystrix/wiki)

## Next Guide

[08-observability.md](./08-observability.md) - Implement structured logging and Prometheus metrics for monitoring.
