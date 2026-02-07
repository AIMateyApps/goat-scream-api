# Custom Error Hierarchy: Fail Gracefully

Generic errors hide information. Custom error classes carry context that helps both API consumers understand what went wrong and operators debug issues quickly.

## Mental Model

Errors form a hierarchy based on who's at fault and what action to take:

```
                    AppError (base)
                         │
     ┌───────────────────┼───────────────────┐
     │                   │                   │
Client Errors (4xx)  Server Errors (5xx)  Rate Limits (429)
     │                   │                   │
┌────┴────┐        ┌─────┴─────┐            │
Validation  NotFound  Database  External    RateLimitExceeded
   400        404       500       502             429
```

**Operational errors** are expected in production: invalid input, missing resources, rate limits. Log them, return helpful messages.

**Programming errors** are bugs: null pointer exceptions, type errors. Alert immediately, return generic message (don't leak internals).

## Copy This Pattern

```javascript
// errors/AppError.js - Base class all errors extend
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.requestId = null; // Set by error handler

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    const obj = {
      error: {
        code: this.code,
        message: this.message,
      },
    };

    if (this.requestId) {
      obj.error.request_id = this.requestId;
    }

    if (process.env.NODE_ENV === 'development') {
      obj.error.stack = this.stack;
    }

    return obj;
  }
}

module.exports = AppError;
```

```javascript
// errors/ValidationError.js - Client sent bad data
const AppError = require('./AppError');

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR', true);
    this.details = details;
  }

  toJSON() {
    const obj = super.toJSON();
    if (this.details) {
      obj.error.details = this.details;
    }
    return obj;
  }
}

module.exports = ValidationError;
```

```javascript
// errors/NotFoundError.js - Resource doesn't exist
const AppError = require('./AppError');

class NotFoundError extends AppError {
  constructor(message = 'Resource not found', resource = null) {
    super(message, 404, 'NOT_FOUND', true);
    this.resource = resource;
  }

  toJSON() {
    const obj = super.toJSON();
    if (this.resource) {
      obj.error.resource = this.resource;
    }
    return obj;
  }
}

module.exports = NotFoundError;
```

```javascript
// errors/index.js - Centralized exports
const AppError = require('./AppError');
const ValidationError = require('./ValidationError');
const NotFoundError = require('./NotFoundError');

// Factory functions for common cases
function validationError(message, details) {
  return new ValidationError(message, details);
}

function notFoundError(resource, id = null) {
  const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
  return new NotFoundError(message, resource);
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  validationError,
  notFoundError,
};
```

## In This Repo

**Base error:** `src/errors/AppError.js:5-46`

Key features:

- `statusCode`: HTTP status to return (400, 404, 500, etc.)
- `code`: Machine-readable error code for client parsing
- `isOperational`: Distinguishes expected errors from bugs
- `toJSON()`: Serializes error for API response, hides stack in production

**Error hierarchy:** `src/errors/index.js:1-96`

Ten error classes for different scenarios:

```
AppError
├── ValidationError (400) - Invalid input
├── NotFoundError (404) - Missing resource
├── AuthenticationError (401) - Invalid credentials
├── AuthorizationError (403) - Insufficient permissions
├── RateLimitError (429) - Too many requests
│   └── RateLimitExceededError (429) - With retry info
├── QuotaExceededError (429) - Daily limit hit
├── DatabaseError (500) - MongoDB failure
├── ExternalServiceError (502) - Cloudinary failure
└── GatewayTimeoutError (504) - Upstream timeout
```

**Validation error with details:** `src/errors/ValidationError.js:7-20`

```javascript
class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR', true);
    this.details = details; // Structured info about what failed
  }

  toJSON() {
    const obj = super.toJSON();
    if (this.details) {
      obj.error.details = this.details;
    }
    return obj;
  }
}
```

**Usage in service:** `src/services/screamsService.js:121-123`

```javascript
if (!scream) {
  throw new NotFoundError('Scream not found', 'scream');
}
```

**Search pattern:** `grep -r "throw new.*Error" src/`

## Try It

Add a `ConflictError` for duplicate resources (HTTP 409):

1. Create `src/errors/ConflictError.js`:

   ```javascript
   const AppError = require('./AppError');

   class ConflictError extends AppError {
     constructor(message = 'Resource already exists', resource = null, existingId = null) {
       super(message, 409, 'CONFLICT', true);
       this.resource = resource;
       this.existingId = existingId;
     }

     toJSON() {
       const obj = super.toJSON();
       if (this.resource) {
         obj.error.resource = this.resource;
       }
       if (this.existingId) {
         obj.error.existing_id = this.existingId;
       }
       return obj;
     }
   }

   module.exports = ConflictError;
   ```

2. Add to `src/errors/index.js`:

   ```javascript
   const ConflictError = require('./ConflictError');

   function conflictError(resource, existingId) {
     return new ConflictError(`${resource} already exists`, resource, existingId);
   }

   module.exports = {
     // ... existing exports
     ConflictError,
     conflictError,
   };
   ```

3. Test it:

   ```javascript
   const { conflictError } = require('./src/errors');
   const err = conflictError('user', 'user-123');
   console.log(JSON.stringify(err.toJSON(), null, 2));
   ```

   Expected output:

   ```json
   {
     "error": {
       "code": "CONFLICT",
       "message": "user already exists",
       "resource": "user",
       "existing_id": "user-123"
     }
   }
   ```

## Debugging Checklist

| Symptom                                  | Check                                                       |
| ---------------------------------------- | ----------------------------------------------------------- |
| Stack trace in production response       | `toJSON()` checking `NODE_ENV`?                             |
| Generic "Internal Error" for known issue | Throwing `AppError` subclass, not plain `Error`?            |
| Missing request_id in error              | Error handler setting `err.requestId`?                      |
| Wrong HTTP status code                   | Constructor calling `super()` with correct statusCode?      |
| Error not logged                         | `isOperational` set correctly? Non-operational should alert |

## FAQ

**Q: Should I create an error class for every HTTP status code?**

A: Create classes for errors you handle differently. 404 and 400 need different details. 500-level errors often share the same structure.

**Q: Why `isOperational`?**

A: Operational errors (user sent bad data) are expected. Programming errors (null reference) indicate bugs. The error handler can page on-call for non-operational errors.

**Q: Should error messages be user-friendly?**

A: Yes for operational errors - they go to API consumers. For non-operational errors, return a generic message and log the real one server-side.

**Q: Why factory functions?**

A: Convenience and consistency. `notFoundError('scream', id)` is cleaner than `new NotFoundError(\`Scream with id '${id}' not found\`, 'scream')`.

**Q: Should errors include field-level details?**

A: For validation errors, yes. Including which fields failed and why helps API consumers fix their requests without guessing.

## Further Reading

- MDN: [Error](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error)
- Node.js: [Errors](https://nodejs.org/api/errors.html)
- HTTP Status Codes: [RFC 7231](https://datatracker.ietf.org/doc/html/rfc7231#section-6)

## Next Guide

[03-centralized-error-handler.md](./03-centralized-error-handler.md) - Build the middleware that transforms errors into consistent API responses.
