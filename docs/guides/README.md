# API Training Guides

A 10-lesson curriculum for building production-ready APIs, using the goat-scream-api as the teaching codebase.

## How to Use These Guides

Each guide follows a consistent structure:

- **Mental model** - Conceptual framing
- **Copy this pattern** - Generic, reusable code template
- **In this repo** - Specific file paths and line numbers
- **Try it** - Hands-on exercise (5-10 minutes)
- **Debugging checklist** - Common failure modes
- **FAQ** - Address misconceptions
- **Further reading** - Official docs links

Work through them in order—each lesson builds on concepts from the previous one.

## Prerequisites

- Node.js 18+
- Basic Express.js knowledge
- Familiarity with async/await

## Lesson Plan

| #                                       | Title                     | What You'll Learn                                            | Key File                         |
| --------------------------------------- | ------------------------- | ------------------------------------------------------------ | -------------------------------- |
| [00](./00-the-big-picture.md)           | The Big Picture           | Layered architecture: Routes → Services → Repositories       | `src/app.js`                     |
| [01](./01-repository-pattern.md)        | Repository Pattern        | Data access abstraction with interchangeable implementations | `src/repositories/index.js`      |
| [02](./02-custom-error-hierarchy.md)    | Custom Error Hierarchy    | Error classes with `toJSON()` for API responses              | `src/errors/AppError.js`         |
| [03](./03-centralized-error-handler.md) | Centralized Error Handler | Express 4-parameter error middleware                         | `src/middleware/errorHandler.js` |
| [04](./04-dual-layer-caching.md)        | Dual-Layer Caching        | Redis with automatic memory fallback                         | `src/services/cache.js`          |
| [05](./05-http-cache-headers.md)        | HTTP Cache Headers        | ETags, Cache-Control, and 304 responses                      | `src/middleware/cache.js`        |
| [06](./06-rate-limiting.md)             | Rate Limiting             | Token bucket algorithm with API key tiers                    | `src/middleware/rateLimiter.js`  |
| [07](./07-circuit-breakers.md)          | Circuit Breakers          | Opossum for external failure protection                      | `src/services/circuitBreaker.js` |
| [08](./08-observability.md)             | Observability             | Structured logging + Prometheus metrics                      | `src/services/metrics.js`        |
| [09](./09-error-tracking.md)            | Error Tracking            | Sentry integration with data scrubbing                       | `src/services/errorTracking.js`  |
| [10](./10-production-readiness.md)      | Production Readiness      | Health checks + graceful shutdown                            | `server.js`                      |

## Quick Start

```bash
# Clone and install
git clone https://github.com/your-repo/goat-scream-api.git
cd goat-scream-api
pnpm install

# Start development server
pnpm run dev

# Run tests
pnpm test

# Try the API
curl http://localhost:3000/api/v1/screams/random
```

## Learning Paths

### Path 1: I need to debug an API issue

Start with [03 - Centralized Error Handler](./03-centralized-error-handler.md), then [08 - Observability](./08-observability.md).

### Path 2: My API is slow

Start with [04 - Dual-Layer Caching](./04-dual-layer-caching.md), then [05 - HTTP Cache Headers](./05-http-cache-headers.md).

### Path 3: My API keeps crashing under load

Start with [06 - Rate Limiting](./06-rate-limiting.md), then [07 - Circuit Breakers](./07-circuit-breakers.md).

### Path 4: I'm deploying to production for the first time

Start with [10 - Production Readiness](./10-production-readiness.md), then [09 - Error Tracking](./09-error-tracking.md).

### Path 5: I want to understand the architecture

Start at [00 - The Big Picture](./00-the-big-picture.md) and work through in order.

## Contributing

Found an error? Want to add a lesson? PRs welcome!

When contributing:

- Follow the existing guide structure
- Include working code examples
- Reference actual files in this codebase
- Test all "Try it" exercises
