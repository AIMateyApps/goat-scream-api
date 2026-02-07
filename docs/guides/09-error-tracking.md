# Error Tracking: Sentry Integration

Logs tell you errors happened. Error tracking services like Sentry tell you how often, with full context, stack traces, and the ability to group related errors. Critical for debugging production issues.

## Mental Model

Sentry adds intelligence on top of raw error logging:

```
┌─────────────────────────────────────────────────────────────┐
│                    Error Tracking                           │
│                                                             │
│  Error occurs → Sentry captures:                            │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Stack trace │  │   Context   │  │  Breadcrumbs │         │
│  │ + source    │  │ request_id  │  │  (user path) │         │
│  │   maps      │  │ user_id     │  │              │         │
│  └─────────────┘  │ route       │  └─────────────┘         │
│                   │ method      │                            │
│                   └─────────────┘                            │
│                                                             │
│  Sentry groups similar errors → Alert on new issues         │
└─────────────────────────────────────────────────────────────┘
```

**Key features:**

- Deduplication (1000 identical errors = 1 issue)
- Source maps (see actual code, not minified)
- Context (tags, extra data, user info)
- Breadcrumbs (what led to the error)

## Copy This Pattern

```javascript
// services/errorTracking.js
const Sentry = require('@sentry/node');
const packageJson = require('../package.json');

let initialized = false;
let enabled = false;

function initialize() {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.info('Error tracking disabled (no SENTRY_DSN)');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    release: `my-api@${packageJson.version}`,
    tracesSampleRate: 0.1, // 10% for performance monitoring

    // Disabled in test environment
    enabled: process.env.NODE_ENV !== 'test',

    // Scrub sensitive data
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['x-api-key'];
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }
      return event;
    },

    // Ignore noise
    ignoreErrors: [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'RateLimitExceededError', // Expected behavior
    ],
  });

  initialized = true;
  enabled = true;
  console.info(`Sentry initialized: ${process.env.NODE_ENV}`);
}

function trackError(error, context = {}, isOperational = false) {
  if (!enabled) return;

  // Don't track 4xx errors unless configured
  if (isOperational && process.env.ERROR_TRACKING_TRACK_4XX !== 'true') {
    return;
  }

  if (initialized) {
    Sentry.withScope(scope => {
      // Add tags for filtering
      scope.setTag('operational', isOperational);
      if (context.request_id) scope.setTag('request_id', context.request_id);
      if (context.route) scope.setTag('route', context.route);
      if (context.method) scope.setTag('method', context.method);
      if (context.status_code) scope.setTag('status_code', context.status_code);

      // Add extra context
      scope.setExtras(context);

      // Set severity
      scope.setLevel(isOperational ? 'warning' : 'error');

      Sentry.captureException(error);
    });
  }
}

function trackMessage(message, level = 'info', context = {}) {
  if (!enabled || !initialized) return;

  Sentry.withScope(scope => {
    scope.setExtras(context);
    scope.setLevel(level);
    Sentry.captureMessage(message);
  });
}

function setUser(user) {
  if (initialized) {
    Sentry.setUser(user);
  }
}

function addBreadcrumb(breadcrumb) {
  if (initialized) {
    Sentry.addBreadcrumb(breadcrumb);
  }
}

// Call before process exit
async function flush(timeout = 2000) {
  if (initialized) {
    return Sentry.flush(timeout);
  }
  return true;
}

module.exports = {
  initialize,
  trackError,
  trackMessage,
  setUser,
  addBreadcrumb,
  flush,
};
```

## In This Repo

**Error tracking service:** `src/services/errorTracking.js:12-246`

**Initialization with data scrubbing:** Lines 40-84

```javascript
Sentry.init({
  dsn,
  environment: process.env.NODE_ENV || 'development',
  release: `goat-scream-api@${packageJson.version}`,
  tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
  enabled: process.env.NODE_ENV !== 'test',

  // Scrub sensitive data before sending
  beforeSend(event) {
    if (event.request?.headers) {
      delete event.request.headers['x-admin-token'];
      delete event.request.headers['x-api-key'];
      delete event.request.headers.authorization;
      delete event.request.headers.cookie;
    }
    return event;
  },

  // Ignore expected/noisy errors
  ignoreErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'RateLimitExceededError'],
});
```

**Error tracking with context:** Lines 100-154

```javascript
function trackError(error, context = {}, isOperational = false) {
  // Skip 4xx unless explicitly enabled
  if (isOperational && process.env.ERROR_TRACKING_TRACK_4XX !== 'true') {
    return;
  }

  Sentry.withScope(scope => {
    scope.setTag('operational', isOperational);
    scope.setTag('request_id', context.request_id);
    scope.setTag('route', context.route);
    scope.setTag('method', context.method);
    scope.setTag('status_code', context.status_code);
    scope.setTag('error_code', context.error_code);

    scope.setExtras(context);
    scope.setLevel(isOperational ? 'warning' : 'error');

    Sentry.captureException(error);
  });
}
```

**Integration in error handler:** `src/middleware/errorHandler.js:52-65`

```javascript
errorTracking.trackError(
  err,
  {
    request_id: requestId,
    route: req.originalUrl,
    method: req.method,
    ip: req.ip,
    status_code: statusCode,
    error_code: err.code,
    is_operational: isOperational,
  },
  isOperational
);
```

**Flush on shutdown:** `server.js:44-45`

```javascript
logInfo('Flushing error tracking events...');
await errorTracking.flush(2000);
```

**App startup:** `src/app.js:25-26`

```javascript
errorTracking.initialize();
```

**Search pattern:** `grep -rn "errorTracking\|Sentry" src/`

## Try It

Set up a Sentry project and verify data scrubbing:

1. **Create a Sentry project:**
   - Go to [sentry.io](https://sentry.io)
   - Create a new Node.js project
   - Copy the DSN

2. **Configure environment:**

   ```bash
   export SENTRY_DSN="https://xxx@sentry.io/xxx"
   export NODE_ENV=development
   pnpm run dev
   ```

3. **Trigger an error:**

   ```bash
   curl "http://localhost:3000/api/v1/screams/nonexistent" \
     -H "X-Api-Key: test-key-12345" \
     -H "Authorization: Bearer secret-token"
   ```

4. **Check Sentry dashboard:**
   - Error should appear with request context
   - Verify sensitive headers are NOT present:
     - No `x-api-key`
     - No `authorization`
     - No `cookie`

5. **Verify operational errors are filtered:**

   ```bash
   # 404 errors shouldn't appear in Sentry by default
   curl "http://localhost:3000/api/v1/nonexistent"
   ```

6. **Test message tracking:**
   ```javascript
   // In a route or service
   const errorTracking = require('./services/errorTracking');
   errorTracking.trackMessage('User completed onboarding', 'info', {
     user_id: 'user-123',
     step: 'final',
   });
   ```

## Debugging Checklist

| Symptom                        | Check                                             |
| ------------------------------ | ------------------------------------------------- |
| Errors not appearing in Sentry | `SENTRY_DSN` set correctly?                       |
| Sensitive data in Sentry       | `beforeSend` scrubbing working?                   |
| Too many 4xx errors            | `ERROR_TRACKING_TRACK_4XX` not set (default: off) |
| Events lost on crash           | `flush()` called before process exit?             |
| Can't correlate with logs      | `request_id` tag being set?                       |
| Release not showing            | `release` option using correct version format?    |

## FAQ

**Q: Why separate error tracking from logging?**

A: Logging is for all events and debugging. Error tracking is specifically for exceptions, with features like deduplication, assignment, and resolution workflows. They complement each other.

**Q: Should I track 4xx errors?**

A: Usually no—they're client errors and expected. A spike in 404s might indicate broken links, but tracking every validation error creates noise. Use metrics for aggregate counts instead.

**Q: What's the `isOperational` flag for?**

A: Operational errors (validation, not found) are expected—user made a mistake. Non-operational errors (null pointer, database down) are bugs or infrastructure issues that need alerts.

**Q: Why flush before shutdown?**

A: Sentry batches events. If the process exits immediately after an error, the event might not be sent. `flush()` ensures pending events are transmitted before exit.

**Q: How do I correlate errors across services?**

A: Pass `request_id` through services (via headers like `X-Request-Id`). Tag errors with this ID in all services. Sentry search: `request_id:abc-123` shows all errors from that request.

**Q: What about PII in error messages?**

A: Be careful with error messages that include user data. Use `beforeSend` to scrub known patterns or use generic messages with IDs you can look up server-side.

## Further Reading

- Sentry: [Node.js SDK](https://docs.sentry.io/platforms/javascript/guides/node/)
- Sentry: [Data Scrubbing](https://docs.sentry.io/product/data-management-settings/scrubbing/)
- Sentry: [Issue Grouping](https://docs.sentry.io/product/data-management-settings/event-grouping/)

## Next Guide

[10-production-readiness.md](./10-production-readiness.md) - Implement health checks, readiness probes, and graceful shutdown.
