# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Items staged for next release._

## [0.1.0] - 2025-11-28

First open-source release following comprehensive 10-agent codebase audit. All CI checks pass (lint, format, tests).

### Added

- **Shared utilities**: `src/utils/auth.js` (timing-safe `secureCompare`, `requireAdmin` middleware) and `src/utils/parsing.js` (`parseBool`, `parseTags`) extracted from duplicated route code
- **TypeScript SDK**: Auto-generated client from OpenAPI spec (`pnpm run generate:sdk`)
- **Structured logging**: All logs include service name, version, timestamp; request-scoped logger with correlation IDs
- **Error tracking**: Sentry integration with scope isolation and sensitive header scrubbing
- **Caching headers**: `Cache-Control` and weak ETags with 304 conditional response support
- **Circuit breaker**: Extended to MongoDB repository methods (via opossum)
- **Config files**: `.editorconfig`, `.nvmrc`, `.dockerignore` for consistent development
- Community health files: `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`
- README polish: badges, requirements table, configuration summary, troubleshooting, community section

### Changed

- **API versioning**: All routes now under `/api/v1/`; legacy `/api/*` paths redirect with 308
- **Error handling in keyRequests.js**: Migrated from raw `res.status().json()` to centralized `AppError` classes (`ValidationError`, `NotFoundError`)
- **Package metadata**: Improved description and keywords for discoverability
- **Documentation**: Fixed API path inconsistencies between README and CLAUDE.md; corrected coverage thresholds

### Security

- **Cloudinary CVE-2025-12613**: Upgraded to cloudinary 2.8.0 (fixes arbitrary argument injection)
- **Timing attack prevention**: Admin token comparison now uses `crypto.timingSafeEqual`
- **RegExp injection**: User input escaped before regex construction in search/filters
- **js-yaml CVE-2025-64718**: Applied pnpm override for `js-yaml>=4.1.1`

### Fixed

- ESLint `sourceType` config: Changed `module` → `script` for CommonJS project
- 30+ lint errors: Fixed crypto imports, unused variables, empty catch blocks
- Removed orphaned files (`.DS_Store`, stray CSV) from repository root
- Replaced deprecated `yamljs` with `js-yaml`

### Removed

- `eslint-plugin-node` (deprecated since 2021, unused in config)

### Infrastructure

- **Dockerfile**: Added HEALTHCHECK instruction (30s interval, 10s timeout, 3 retries)
- **MongoDB**: Connection pooling configured (`maxPoolSize: 10`, `minPoolSize: 2`)
- **pnpm**: Standardized on v10 across CI workflows and package.json
- **Node.js**: `engines` field requires >=20.0.0

### Developer Experience

- All 316 tests passing with 77% line coverage
- `pnpm run lint`, `pnpm run format:check` now pass cleanly
- Comprehensive roadmap with engineering health assessment in `docs/roadmap.md`

### Notes

- This release represents a fresh repository suitable for organization GitHub publication
- See `docs/roadmap.md` for detailed engineering health assessment and future plans
