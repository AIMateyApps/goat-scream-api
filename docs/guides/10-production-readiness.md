# Production Readiness: Health Checks + Graceful Shutdown

Production APIs need to tell orchestrators (Kubernetes, load balancers) whether they can accept traffic, and handle shutdowns without dropping requests. This is the difference between zero-downtime deploys and user-facing errors.

## Mental Model

Two health endpoints serve different purposes:

```
┌─────────────────────────────────────────────────────────────┐
│                   Health Endpoints                          │
│                                                             │
│  /health (Liveness)         /ready (Readiness)              │
│  "Is the process alive?"    "Can it serve requests?"        │
│                                                             │
│  - Simple 200 response      - Checks dependencies:          │
│  - Restarts container if    │  - Database connected?        │
│    unhealthy                │  - Cache available?           │
│  - Fast, no side effects    │  - Circuit breakers healthy?  │
│                             │  - Data files readable?       │
│                             │                               │
│                             - Removes from load balancer    │
│                               if unhealthy                  │
└─────────────────────────────────────────────────────────────┘
```

**Graceful shutdown** ensures in-flight requests complete:

```
SIGTERM received
      ↓
1. Stop accepting new connections
2. Set readiness to "shutting down"
3. Wait for active requests to complete
4. Close database connections
5. Flush logs/metrics/error tracking
6. Exit cleanly
```

## Copy This Pattern

```javascript
// Health endpoints in app.js
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime_seconds: process.uptime(),
  });
});

app.get('/ready', async (req, res) => {
  const checks = {
    shutdown: isShuttingDown,
    db: null,
    cache: null,
  };

  // Reject if shutting down
  if (isShuttingDown) {
    return res.status(503).json({
      status: 'not ready',
      reason: 'Service is shutting down',
      checks,
    });
  }

  // Check database
  try {
    await db.ping();
    checks.db = { status: 'connected' };
  } catch (err) {
    checks.db = { status: 'disconnected', error: err.message };
    return res.status(503).json({ status: 'not ready', checks });
  }

  // Check cache
  try {
    checks.cache = cache.getStats();
  } catch {
    checks.cache = { status: 'unavailable' };
  }

  res.json({
    status: 'ready',
    checks,
    version: packageJson.version,
    timestamp: new Date().toISOString(),
  });
});
```

```javascript
// Graceful shutdown in server.js
let server = null;
let isShuttingDown = false;

function getShutdownStatus() {
  return isShuttingDown;
}

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.warn('Shutdown already in progress, forcing exit');
    process.exit(1);
  }

  isShuttingDown = true;
  console.info(`Received ${signal}, starting graceful shutdown`);

  // Set a timeout to force exit if shutdown takes too long
  const shutdownTimeout = setTimeout(() => {
    console.error('Shutdown timeout reached, forcing exit');
    process.exit(1);
  }, 30000);

  // Stop accepting new connections
  if (server) {
    server.close(async () => {
      console.info('HTTP server closed');

      try {
        // Flush error tracking
        await errorTracking.flush(2000);

        // Close database
        if (db.isConnected()) {
          await db.close();
          console.info('Database closed');
        }

        clearTimeout(shutdownTimeout);
        console.info('Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        console.error('Error during shutdown:', err.message);
        process.exit(1);
      }
    });
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle crashes
process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err);
  errorTracking.trackError(err, { type: 'uncaughtException' });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', reason => {
  console.error('Unhandled rejection:', reason);
  const err = reason instanceof Error ? reason : new Error(String(reason));
  errorTracking.trackError(err, { type: 'unhandledRejection' });
  gracefulShutdown('unhandledRejection');
});

// Start server
server = app.listen(PORT, () => {
  console.info(`Server running on port ${PORT}`);
});

module.exports = { getShutdownStatus };
```

## In This Repo

**Liveness endpoint:** `src/app.js:109-120`

Simple health check that confirms the process is running:

```javascript
app.get('/health', (req, res) => {
  const { getDbStatus } = require('./db/connection');
  const db = getDbStatus();

  res.json({
    status: 'screaming', // Fun twist on "healthy"
    db: {
      connected: db.connected || false,
    },
    uptime_seconds: process.uptime(),
  });
});
```

**Readiness endpoint:** `src/app.js:123-201`

Comprehensive dependency checks:

```javascript
app.get('/ready', async (req, res) => {
  const checks = {
    shutdown: false,
    db: null,
    data: null,
  };

  // Check shutdown flag
  if (getShutdownStatus && getShutdownStatus()) {
    checks.shutdown = true;
    return res.status(503).json({
      status: 'not ready',
      checks,
      message: 'Service is shutting down',
    });
  }

  // Check MongoDB (if required)
  if (requireMongo) {
    try {
      await mongoose.connection.db.admin().ping();
      checks.db = { status: 'connected', uri: db.uri };
    } catch (err) {
      checks.db = { status: 'disconnected', error: err.message };
      return res.status(503).json({ status: 'not ready', checks });
    }
  }

  // Check static data file
  try {
    const screams = getStaticScreams();
    checks.data = { status: 'ok', count: screams.length };
  } catch (err) {
    return res.status(503).json({ status: 'not ready', checks });
  }

  // Check circuit breakers
  const circuitBreakers = getAllCircuitStates();

  res.json({
    status: 'ready',
    checks,
    circuit_breakers: circuitBreakers,
    version: packageJson.version,
  });
});
```

**Graceful shutdown:** `server.js:20-79`

```javascript
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    logWarn('Shutdown already in progress, forcing exit');
    process.exit(1);
  }

  isShuttingDown = true;
  logInfo('Received shutdown signal', { signal });

  if (server) {
    server.close(async () => {
      logInfo('HTTP server closed');

      const shutdownTimeout = setTimeout(() => {
        logWarn('Shutdown timeout reached, forcing exit');
        process.exit(1);
      }, 30000);

      try {
        // Flush Sentry
        await errorTracking.flush(2000);

        // Close MongoDB
        if (db.connected) {
          await mongoose.connection.close();
        }

        clearTimeout(shutdownTimeout);
        logInfo('Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        logError('Error during shutdown', { error: err.message });
        process.exit(1);
      }
    });
  }
}
```

**Signal handlers:** `server.js:82-83`

```javascript
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

**Crash handlers:** `server.js:86-100`

```javascript
process.on('uncaughtException', err => {
  logError('Uncaught exception', { error: err.message, stack: err.stack });
  errorTracking.trackError(err, { type: 'uncaughtException' }, false);
  gracefulShutdown('uncaughtException').then(() => process.exit(1));
});

process.on('unhandledRejection', (reason, _promise) => {
  logError('Unhandled rejection', { reason: String(reason) });
  const err = reason instanceof Error ? reason : new Error(String(reason));
  errorTracking.trackError(err, { type: 'unhandledRejection' }, false);
  gracefulShutdown('unhandledRejection').then(() => process.exit(1));
});
```

**Search pattern:** `grep -rn "gracefulShutdown\|SIGTERM\|/health\|/ready" .`

## Try It

Send SIGTERM during active requests and verify clean shutdown:

1. **Start the server:**

   ```bash
   pnpm run dev
   ```

2. **In another terminal, make a slow request:**

   ```bash
   # This request should complete despite shutdown
   curl -v "http://localhost:3000/api/v1/screams?limit=100" &
   ```

3. **Send SIGTERM:**

   ```bash
   # Find the process
   PID=$(lsof -t -i:3000)
   echo "Server PID: $PID"

   # Send SIGTERM
   kill -TERM $PID
   ```

4. **Observe the logs:**

   ```
   [INFO] Received shutdown signal { signal: 'SIGTERM' }
   [INFO] HTTP server closed
   [INFO] Flushing error tracking events...
   [INFO] Graceful shutdown complete
   ```

5. **Verify the request completed** (background curl should return data, not error)

6. **Test readiness during shutdown:**
   ```bash
   # In quick succession:
   kill -TERM $PID &
   curl "http://localhost:3000/ready"
   ```
   Should return 503 with `"message": "Service is shutting down"`

## Debugging Checklist

| Symptom                             | Check                                                  |
| ----------------------------------- | ------------------------------------------------------ |
| /health returns 500                 | Check if it's calling dependencies it shouldn't        |
| /ready always 503                   | Database connection issue? Check db.ping()             |
| Requests dropped on shutdown        | `server.close()` not called? Check isShuttingDown flag |
| Shutdown hangs forever              | Timeout not set? Long-running requests blocking?       |
| Double shutdown attempts            | isShuttingDown flag not set early enough?              |
| Uncaught exception crashes silently | process.on('uncaughtException') handler missing?       |

## FAQ

**Q: Liveness vs Readiness—when do I use which?**

A: **Liveness** for restart decisions (process deadlocked? restart it). **Readiness** for traffic decisions (database down? don't send requests). A service can be alive but not ready.

**Q: What timeout for graceful shutdown?**

A: Match your longest expected request duration plus buffer. 30 seconds is common. Too short = dropped requests. Too long = slow deploys.

**Q: Should health checks call databases?**

A: **Liveness:** No—it should never fail due to external dependencies. **Readiness:** Yes—it should reflect ability to handle traffic.

**Q: How do I handle stuck connections?**

A: `server.close()` waits for connections to finish. Set a timeout and force exit if exceeded. Some teams also drain connections by tracking active requests.

**Q: What about keep-alive connections?**

A: Set `Connection: close` header during shutdown to tell clients not to reuse the connection. Or close them after a shorter timeout.

**Q: Should I log shutdown events?**

A: Yes! Shutdown events are critical for debugging deployment issues. Log signal received, each cleanup step, and final exit.

## Kubernetes Configuration Example

```yaml
# deployment.yaml
spec:
  containers:
    - name: api
      livenessProbe:
        httpGet:
          path: /health
          port: 3000
        initialDelaySeconds: 10
        periodSeconds: 10
        failureThreshold: 3

      readinessProbe:
        httpGet:
          path: /ready
          port: 3000
        initialDelaySeconds: 5
        periodSeconds: 5
        failureThreshold: 3

      lifecycle:
        preStop:
          exec:
            command: ['/bin/sh', '-c', 'sleep 5'] # Allow LB to drain
```

## Further Reading

- Kubernetes: [Configure Liveness, Readiness](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- Node.js: [Graceful Shutdown](https://blog.heroku.com/best-practices-nodejs-errors)
- Google SRE: [Handling Overload](https://sre.google/sre-book/handling-overload/)

---

## Congratulations!

You've completed the API Training Guides. You now understand:

1. **Layered architecture** - Routes → Services → Repositories
2. **Repository pattern** - Portable data access
3. **Error hierarchy** - Custom error classes for consistent responses
4. **Centralized error handler** - One place for all error transformation
5. **Dual-layer caching** - Redis + memory fallback
6. **HTTP cache headers** - ETags and Cache-Control
7. **Rate limiting** - Token bucket with API key tiers
8. **Circuit breakers** - Protection from cascading failures
9. **Observability** - Logging, metrics, and tracing
10. **Error tracking** - Sentry integration with data scrubbing
11. **Production readiness** - Health checks and graceful shutdown

Each pattern builds on the previous. Together, they form the foundation of a production-ready API.

**Next steps:**

- Apply these patterns to your own projects
- Read the source code in this repo for implementation details
- Contribute improvements back!
