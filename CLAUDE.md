# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Goat Screams API is a production-ready Express.js service that serves curated goat scream audio data. It operates in two modes:

- **Static mode** (default): Serves from `data/screams-public.json` - no external dependencies
- **Full-stack mode**: MongoDB + Cloudinary integration for user submissions and moderation

The API runs at https://api.bleatbox.dev in production.

## Common Commands

```bash
# Development
pnpm install          # Install dependencies
pnpm run dev          # Start dev server (auto-builds static site, runs on port 3000)
pnpm start            # Production start

# Testing
pnpm test             # Run Jest test suite with coverage
pnpm run smoke        # Smoke test against live/local endpoint

# Code Quality
pnpm run lint         # ESLint check
pnpm run lint:fix     # ESLint with auto-fix
pnpm run format       # Prettier format all files
pnpm run format:check # Prettier check

# Static Site
pnpm run build:site   # Rebuild public/index.html from site/ templates

# Data Management
pnpm run export:api   # Pull from live API → JSON snapshot
pnpm run export:fun   # Export from MongoDB → JSON snapshot (requires MONGODB_URI)
```

## Architecture

### Layered Design Pattern

```
Routes (src/routes/) → Services (src/services/) → Repositories (src/repositories/)
                                                         ↓
                                            MongoScreamsRepository (MongoDB mode)
                                            StaticScreamsRepository (static mode)
```

Routes are thin HTTP handlers that delegate to service classes. Services contain business logic and use the repository pattern for data access. The `getScreamsRepository()` factory function returns the appropriate repository based on `FULL_STACK` mode.

### Key Services

- **ScreamsService** (`src/services/screamsService.js`): Core business logic for scream retrieval, filtering, random selection
- **CacheService** (`src/services/cache.js`): Redis-backed cache with automatic in-memory fallback
- **CircuitBreaker** (`src/services/circuitBreaker.js`): Opossum-based circuit breaker for Cloudinary calls
- **Metrics** (`src/services/metrics.js`): Prometheus metrics collection

### Error Handling

Custom error classes in `src/errors/` extend `AppError` and provide structured error responses with correlation IDs. The centralized `errorHandler` middleware transforms these into consistent JSON responses.

### Static Site Builder

The marketing site is generated from `site/` using a minimal template system:

- Data: `site/data/` - page content and shared data
- Components: `site/components/` - HTML-returning functions
- Pages: `site/pages/` - page entry points
- Output: `public/index.html`

Run `pnpm run build:site` to regenerate (auto-runs before `pnpm run dev`).

## API Endpoints

- `GET /api/v1/screams` - Paginated list
- `GET /api/v1/screams/random` - Random scream(s)
- `GET /api/v1/screams/:id` - Single scream by ID
- `GET /api/v1/search` - Full-text search with filters
- `GET /api/v1/stats` - Collection statistics
- `GET /health` - Liveness check
- `GET /ready` - Readiness check (includes DB, cache, circuit breaker status)
- `GET /metrics` - Prometheus metrics

## Testing

Tests live in `tests/` with pattern `*.spec.js`. The test setup (`tests/setup.js`) configures a 30-second timeout and sets test-mode environment variables.

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test -- tests/services/screamsService.spec.js

# Run tests matching pattern
pnpm test -- --testNamePattern="random"
```

Coverage thresholds: 75% statements, 60% branches, 75% functions, 75% lines.

## Environment Variables

Key variables (see `.env.example` for complete list):

| Variable             | Description                    | Default |
| -------------------- | ------------------------------ | ------- |
| `PORT`               | Server port                    | `3000`  |
| `FULL_STACK`         | Enable MongoDB/Cloudinary mode | `false` |
| `MONGODB_URI`        | MongoDB connection string      | -       |
| `CLOUDINARY_URL`     | Cloudinary credentials         | -       |
| `ADMIN_TOKEN`        | Token for moderation routes    | -       |
| `REDIS_URL`          | Redis connection (optional)    | -       |
| `REQUEST_TIMEOUT_MS` | Request timeout                | `30000` |

## Data Flow

1. Static mode reads from `data/screams-public.json` on startup
2. Full-stack mode connects to MongoDB and uses live queries
3. Cache layer (Redis or in-memory) accelerates hot paths
4. Circuit breaker protects Cloudinary integration from cascading failures

## File Naming Conventions

- Routes: `src/routes/<resource>.js`
- Services: `src/services/<name>Service.js`
- Repositories: `src/repositories/<name>Repository.js`
- Tests: `tests/<path>/<file>.spec.js` mirroring source structure
- Error classes: `src/errors/<ErrorName>.js`
