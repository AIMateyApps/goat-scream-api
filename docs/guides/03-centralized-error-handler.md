# Centralized Error Handler: One Place for All Errors

Scattered try-catch blocks lead to inconsistent error responses. A centralized error handler ensures every error—whether from your code, Mongoose, or an unexpected crash—returns a predictable JSON structure.

## Mental Model

Express recognizes error handlers by their 4-parameter signature:

```javascript
function errorHandler(err, req, res, next) { ... }
```

Any error passed to `next(err)` flows to this handler. It's the API's last line of defense:

```
Route throws → Service throws → Repository throws
                      ↓
              next(err) called
                      ↓
           Error Handler Middleware
                      ↓
    ┌─────────────────┴─────────────────┐
    │  Transform → Log → Track → Respond │
    └───────────────────────────────────┘
```

## Copy This Pattern

```javascript
// middleware/errorHandler.js
const mongoose = require('mongoose');
const { AppError, ValidationError } = require('../errors');

function errorHandler(err, req, res, next) {
  // Set request ID for correlation
  const requestId = req.requestId || 'unknown';

  // Transform Mongoose validation errors
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message,
    }));
    err = new ValidationError('Validation failed', details);
    err.requestId = requestId;
  }

  // Transform Mongoose CastError (invalid ObjectId)
  if (err instanceof mongoose.Error.CastError) {
    err = new ValidationError(`Invalid ${err.path}: ${err.value}`, {
      field: err.path,
      value: err.value,
    });
    err.requestId = requestId;
  }

  // Handle known AppError instances
  if (err instanceof AppError) {
    err.requestId = requestId;

    // Log with appropriate level
    const logPayload = {
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status_code: err.statusCode,
      error_code: err.code,
      error_message: err.message,
    };

    if (err.isOperational) {
      console.warn(JSON.stringify(logPayload));
    } else {
      console.error(JSON.stringify({ ...logPayload, stack: err.stack }));
    }

    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle unknown errors (programming bugs)
  console.error(
    JSON.stringify({
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      error_name: err.name,
      error_message: err.message,
      stack: err.stack,
    })
  );

  // Never expose internal details in production
  const response = {
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
      request_id: requestId,
    },
  };

  if (process.env.NODE_ENV === 'development') {
    response.error.stack = err.stack;
  }

  return res.status(500).json(response);
}

module.exports = errorHandler;
```

**Mount it last in app.js:**

```javascript
// After all routes
app.use(errorHandler);
```

## In This Repo

**Error handler:** `src/middleware/errorHandler.js:21-130`

Key behaviors:

1. **Sets request ID for correlation** (lines 22-26):

   ```javascript
   const requestId = req.requestId || 'unknown';
   if (err instanceof AppError) {
     err.requestId = requestId;
   }
   ```

2. **Transforms Mongoose errors** (lines 28-45):

   ```javascript
   if (err instanceof mongoose.Error.ValidationError) {
     const validationErrors = Object.values(err.errors).map(e => ({
       field: e.path,
       message: e.message,
     }));
     err = new ValidationError('Validation failed', validationErrors);
   }
   ```

3. **Tracks errors with Sentry** (lines 52-65):

   ```javascript
   errorTracking.trackError(
     err,
     {
       request_id: requestId,
       route: req.originalUrl,
       method: req.method,
       status_code: statusCode,
       error_code: err.code,
       is_operational: isOperational,
     },
     isOperational
   );
   ```

4. **Returns error via `toJSON()`** (line 87):
   ```javascript
   return res.status(statusCode).json(err.toJSON());
   ```

**Mounting location:** `src/app.js:282`

```javascript
// Error handler middleware (must be last)
app.use(errorHandler);
```

**Request ID generation:** `src/app.js:75-78`

```javascript
app.use((req, res, next) => {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  // ...
});
```

**Search pattern:** `grep -rn "next(err)" src/routes/`

## Try It

Trigger each error type and verify the response format:

1. **ValidationError** - Invalid query parameter:

   ```bash
   curl -s "http://localhost:3000/api/v1/screams/ordered/invalid" | jq
   ```

   Expected: 400 with `VALIDATION_ERROR` code

2. **NotFoundError** - Non-existent scream:

   ```bash
   curl -s "http://localhost:3000/api/v1/screams/nonexistent-id" | jq
   ```

   Expected: 404 with `NOT_FOUND` code

3. **Route not found** - Invalid endpoint:

   ```bash
   curl -s "http://localhost:3000/api/v1/invalid" | jq
   ```

   Expected: 404 with `NOT_FOUND` code

4. **Verify request_id** is present in all responses:

   ```bash
   curl -s "http://localhost:3000/api/v1/screams/invalid" | jq '.error.request_id'
   ```

5. **Check X-Request-Id header** matches response:
   ```bash
   curl -si "http://localhost:3000/api/v1/screams/invalid" | grep -i x-request-id
   ```

## Debugging Checklist

| Symptom                           | Check                                                                     |
| --------------------------------- | ------------------------------------------------------------------------- |
| Error handler not called          | Handler registered with 4 parameters? `(err, req, res, next)`             |
| Handler bypassed                  | Middleware order correct? Error handler must be last                      |
| HTML error page instead of JSON   | Check if express-error-handler or similar is also mounted                 |
| Mongoose errors not transformed   | Checking `mongoose.Error.ValidationError`, not `mongoose.ValidationError` |
| Stack trace leaking to production | `NODE_ENV` set correctly in production?                                   |
| Request ID always "unknown"       | Request ID middleware running before routes?                              |

## FAQ

**Q: Why transform Mongoose errors?**

A: Mongoose errors have a different structure than your API's error format. Transforming them provides consistent responses regardless of error source.

**Q: Should I catch errors in routes or use `next(err)`?**

A: Always use `next(err)`. Catching in routes leads to inconsistent error handling. The pattern is:

```javascript
router.get('/', async (req, res, next) => {
  try {
    const result = await service.method();
    res.json(result);
  } catch (err) {
    next(err); // Let error handler deal with it
  }
});
```

**Q: How do I add custom headers to error responses?**

A: Set them in the error handler before calling `res.json()`:

```javascript
if (err instanceof RateLimitError) {
  res.setHeader('Retry-After', err.retryAfter);
}
```

**Q: What about async errors in middleware?**

A: Express 4 doesn't catch async errors automatically. Wrap handlers:

```javascript
const asyncHandler = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
```

Express 5 handles this natively.

**Q: Should I log all errors?**

A: Log all errors, but at different levels. Operational errors (4xx) are warnings. Server errors (5xx) are errors. Track only server errors in Sentry to avoid noise.

## Further Reading

- Express.js: [Error Handling](https://expressjs.com/en/guide/error-handling.html)
- Mongoose: [Error Handling](https://mongoosejs.com/docs/api/error.html)
- Node.js: [Error Handling Best Practices](https://nodejs.org/en/docs/guides/error-handling/)

## Next Guide

[04-dual-layer-caching.md](./04-dual-layer-caching.md) - Build a cache service with Redis support and graceful fallback to in-memory storage.
