# Goat Screams API Roadmap

This living roadmap combines the original MVP ExecPlan, technical guide, and development order into a single reference. It summarizes completed work, the remaining priorities to ship a polished V1, and aspirational ideas for a V2+ release.

We’re keeping the feature-rich stack in place, but the North Star is a joyful, open gallery for anyone to play with goat screams. The roadmap now calls out a “fun-first” public track alongside optional operational work so contributors can choose their own adventure.

Active ExecPlan: none. V1 plan is complete and removed. See `.internal/docs/PLANS.md` for ExecPlan rules if we author a new plan, and use this roadmap to track follow-ups.

## Runtime Strategy Update (2025-01-27)

We are now static-by-default in production to ensure zero-maintenance longevity and maximum approachability:

- Default API (production): API serves the checked-in snapshot at `data/screams-public.json`. MongoDB/Cloudinary are not required in prod.
- Advanced API (opt-in): Enable only when `FULL_STACK=true` (for local demos/teaching). Adds submissions and moderation features.
- Snapshot generation: Prefer `pnpm run export:api` (pulls from the live API) or `pnpm run export:fun` (pulls from Mongo if `MONGODB_URI` is set). Commit the resulting JSON when you choose to refresh.
- Maintenance policy: Zero scheduled jobs. Manual refresh optional and rare. No weekly automation.
- Guardrails in code: Startup fail-fast when Advanced API is requested but DB isn't reachable; default API warns on placeholder links. The snapshot route was intentionally not added to keep the surface minimal.

---

## 🔬 Engineering Health Assessment (2025-11-27)

Comprehensive 10-agent codebase review covering architecture, dependencies, security, patterns, error handling, testing, API design, performance, DevOps, and maintainability.

### Overall Health Score: 8.0/10 ⭐⭐⭐⭐ (Updated 2025-11-27)

| Aspect           | Score  | Status    |
| ---------------- | ------ | --------- |
| Architecture     | 7.5/10 | ✅ Solid  |
| Dependencies     | 7.5/10 | ✅ Solid  |
| Security         | 8.0/10 | ✅ Strong |
| Code Patterns    | 8.0/10 | ✅ Strong |
| Error Handling   | 7.5/10 | ✅ Solid  |
| Testing          | 7.5/10 | ✅ Solid  |
| API Design       | 8.5/10 | ✅ Strong |
| Performance      | 8.0/10 | ✅ Strong |
| DevOps Readiness | 8.5/10 | ✅ Strong |
| Maintainability  | 8.0/10 | ✅ Strong |

**Verdict**: Production-ready Express.js API with mature engineering practices. Suitable for moderate traffic (10K-100K req/day).

### Key Strengths

- **Clean Layered Architecture** — Repository pattern with dual-mode support (MongoDB/Static fallback)
- **Excellent Error Handling** — 11 custom error classes with correlation IDs and production-safe responses
- **Strong Observability** — Prometheus metrics, structured logging, health/readiness probes
- **Production Resilience** — Circuit breaker, graceful shutdown, Redis cache with in-memory fallback
- **Comprehensive Documentation** — OpenAPI 3.1, detailed README, CLAUDE.md guidance
- **Good Test Coverage** — 77% line coverage with realistic thresholds enforced

### 🚨 Critical Security Issues

These should be addressed before any public announcement or increased traffic:

#### 1. Cloudinary CVE-2025-12613 (HIGH Severity)

```text
Package: cloudinary ^1.41.3
CVSS: 8.6 (Arbitrary Argument Injection)
Fix: Upgrade to cloudinary >=2.7.0
```

#### 2. Timing Attack on Admin Token

```javascript
// Current (vulnerable) in src/routes/moderation.js:
if (token !== ADMIN_TOKEN) { ... }

// Fix - use constant-time comparison:
const crypto = require('crypto');
crypto.timingSafeEqual(Buffer.from(token), Buffer.from(ADMIN_TOKEN));
```

#### 3. RegExp Injection Risk

```javascript
// Add escaping before creating regex in src/services/searchService.js:
const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
```

### Technical Debt Action Plan

#### Week 1 (Critical) ✅ COMPLETED 2025-11-27

- [x] Upgrade `cloudinary` to >=2.7.0 (security CVE) — upgraded to 2.8.0
- [x] Fix admin token timing attack vulnerability — added `crypto.timingSafeEqual` in moderation.js and keyRequests.js
- [x] Add RegExp escaping for user input in search/filters — added `escapeRegex()` utility in filters.js

#### Week 2 (High Priority) ✅ COMPLETED 2025-11-27

- [x] Implement `/api/v1/` versioning — all routes now under `/api/v1/`, legacy `/api/*` redirects with 308
- [x] Add HEALTHCHECK instruction to Dockerfile — 30s interval, 10s timeout, 3 retries
- [x] Configure MongoDB connection pooling — `maxPoolSize: 10`, `minPoolSize: 2`, configurable via `MONGO_POOL_SIZE`
- [x] Add file upload validation — 50MB max, audio MIME whitelist (MP3, WAV, OGG, FLAC, M4A, AAC, WebM)

#### Month 1 (Medium Priority) ✅ COMPLETED 2025-11-28

- [x] Add ETag/Cache-Control response headers — `Cache-Control` per route type, weak ETags with 304 support
- [x] Integrate error tracking (Sentry or similar) — `@sentry/node` with scope isolation, sensitive header scrubbing
- [x] Expand circuit breaker to MongoDB calls — all repository methods wrapped with opossum circuit breaker
- [x] Increase test coverage — functions 77.5%, branches 64%, statements 76.4%
- [x] Document filter composition rules in OpenAPI spec — comprehensive docs for list and search endpoint filters

#### Month 2 (Developer Experience & Maintenance) — ✅ COMPLETED 2025-11-28

- [x] Update major dependencies — helmet 8.1, supertest 7.1, multer 2.0, plus safe minor updates
- [x] Generate TypeScript SDK from OpenAPI spec — `pnpm run generate:sdk`, outputs to `sdk/typescript/`
- [x] Add service name and correlation ID to structured logs — all logs include `service`, `version`, `timestamp`; use `createRequestLogger(req)` for request-scoped logging
- [x] Evaluate Express 5.x and Mongoose 9.x migration paths — see migration notes below

##### Express 5.x Migration Assessment

**Impact: Low** — Safe to upgrade when stable release is available

Breaking changes affecting this codebase:

1. **`express.static` dotfiles default** — Changes from `'ignore'` to `'deny'`. Current usage in [app.js:204](src/app.js#L204) doesn't set explicit option. Fix: Add `{ dotfiles: 'ignore' }` if dotfiles in `public/` need serving.

2. **Rejected promise handling** — Express 5 auto-forwards rejected promises to error handler. This is a **positive change** that simplifies async route handling.

No deprecated methods found (`req.param()`, `res.sendfile()`, `app.del()` not used).

##### Mongoose 9.x Migration Assessment

**Impact: Medium** — One code change required before upgrade

Breaking changes affecting this codebase:

1. **Update pipelines disallowed by default** — [rateLimiter.js:36-50](src/middleware/rateLimiter.js#L36) uses aggregation pipeline syntax with `updateOne()`:

   ```javascript
   await ApiKey.updateOne({ key: apiKey.key }, [{ $set: { ... } }]);
   ```

   **Fix required**: Add `{ updatePipeline: true }` option, or refactor to standard `$set` object syntax.

2. **Callbacks removed** — Not affected; codebase uses async/await throughout.

3. **`doValidate()` returns Promise** — Not affected; no direct `doValidate()` calls found.

All other `updateOne()`/`updateMany()` calls use standard `{ $set: ... }` object syntax (14 occurrences) — no changes needed.

### Detailed Findings Summary

#### Architecture (7.5/10)

- Clean separation: Routes → Services → Repositories
- Factory pattern for runtime mode switching
- Graceful fallback from MongoDB to static JSON
- ⚠️ Filter sync between static/mongo repos creates maintenance burden

#### Dependencies (7.5/10)

- 28 total deps (15 prod, 13 dev) — appropriately lean
- ✅ cloudinary upgraded to 2.8.0 (CVE fixed)
- ⚠️ 8+ packages one major version behind (jest, supertest, mongoose, helmet)
- ⚠️ Some unmaintained packages (cors, morgan) — yamljs replaced with js-yaml

#### Security (8.0/10)

- ✅ Helmet with custom CSP, API key auth, rate limiting
- ✅ Timing-safe comparison for admin tokens (crypto.timingSafeEqual)
- ✅ File upload validation (50MB max, audio MIME whitelist)
- ⚠️ CORS wildcard (acceptable for public API)

#### Code Patterns (8.0/10)

- Repository, Factory, Singleton patterns well-implemented
- SOLID principles followed (8.5/10 average)
- Excellent error hierarchy with AppError base

#### Error Handling (7.5/10)

- 11 custom error classes with rich context
- ✅ Sentry error tracking with scope isolation, context tagging, and sensitive header scrubbing
- ⚠️ Circuit breaker scope too narrow

#### Testing (7.5/10)

- 29 test files, 77% line coverage
- MongoDB Memory Server for realistic tests
- ⚠️ Branch coverage at 64%, no concurrency tests

#### API Design (8.5/10)

- Excellent OpenAPI 3.1 documentation
- Consistent pagination and error responses
- ✅ `/api/v1/` versioning with 308 redirects for legacy paths

#### Performance (8.0/10)

- Redis + in-memory cache with fallback
- Compression enabled, Prometheus metrics
- ✅ MongoDB connection pooling configured (maxPoolSize: 10)
- ✅ ETag/Cache-Control headers with 304 conditional response support

#### DevOps (8.5/10)

- Comprehensive health/ready endpoints
- Graceful shutdown with 30s timeout
- Multi-stage Dockerfile, CI/CD pipelines
- ✅ HEALTHCHECK instruction in Dockerfile (30s interval, 10s timeout)

#### Maintainability (8.0/10)

- Only 1 TODO in entire codebase
- 10.9% comment ratio with JSDoc
- ESLint + Prettier configured

---

## 🚀 Pre-Open-Source Audit (2025-11-28)

Comprehensive 10-agent audit preparing for fresh repo publication to organization GitHub. Since we're publishing as a new repo (no git history), credential rotation concerns are simplified—focus is on ensuring the published codebase is clean and world-class.

### Repo Health Score: 68/100 → 90/100 (Updated 2025-11-28)

| Category              | Score  | Status                 | Priority |
| --------------------- | ------ | ---------------------- | -------- |
| Documentation Quality | 9.0/10 | ✅ Consistent          | —        |
| Code Structure        | 9.0/10 | ✅ Clean               | —        |
| API Surface Area      | 9.0/10 | ✅ DRY utilities       | —        |
| Code Clarity          | 8.5/10 | ✅ Improved            | —        |
| Comments & Debug      | 9.2/10 | ✅ Excellent           | —        |
| Security & Secrets    | 8.5/10 | ✅ Fresh repo safe     | —        |
| Dependencies          | 9.0/10 | ✅ No vulnerabilities  | —        |
| Testing Coverage      | 7.5/10 | ⚠️ Infrastructure gaps | Medium   |
| Build & CI/CD         | 9.0/10 | ✅ All checks pass     | —        |
| Licensing & Metadata  | 8.0/10 | ⚠️ No releases         | Low      |

**Verdict**: All blockers resolved. CI passes (lint, format, tests). Ready for fresh repo push. Remaining items are polish for world-class presentation.

### ✅ Blockers (All Resolved 2025-11-28)

These items have been fixed and CI now passes:

#### 1. CI Failures: 21 Lint Errors + 25 Unformatted Files

```bash
# Fix lint errors (most are unused params in baseRepository.js)
pnpm run lint:fix
# Then manually prefix unused params with underscore

# Format all files
pnpm run format
```

**Files with lint errors**:

- `scripts/generate-curated-ai.js` — empty blocks, undefined variables
- `scripts/purge-source.js` — empty block statements
- `scripts/sync-analysis.js` — unused function `parseAnalysisTags`
- `src/repositories/baseRepository.js` — 10 unused parameters (prefix with `_`)
- `src/repositories/staticScreamsRepository.js` — 3 unused vars
- `tests/db/connection.spec.js` — conditional expects
- `tests/keyRequests.spec.js` — test with no assertions

#### 2. ESLint Config Mismatch

**File**: `eslint.config.js:16`

```javascript
// Current (wrong for CommonJS project):
sourceType: 'module';

// Fix:
sourceType: 'script';
```

#### 3. Security Vulnerability: js-yaml CVE-2025-64718

```bash
pnpm update js-yaml@^4.1.1
```

Transitive dependency via ESLint and Jest. Moderate severity (CVSS 5.3).

#### 4. Root Directory Pollution

Remove before publishing:

- `goat_scream_analysis (3).csv` — orphaned data file in root
- 44 `.DS_Store` files — committed despite gitignore

```bash
rm "goat_scream_analysis (3).csv"
find . -name .DS_Store -print0 | xargs -0 git rm -f --ignore-unmatch
```

#### 5. Unused/Deprecated Dependency

```bash
pnpm remove eslint-plugin-node  # Deprecated since 2021, not used in config
```

#### 6. Ensure .env Excluded from Fresh Repo

Since we're pushing to a fresh org repo, verify `.env` is in `.gitignore` and **do not include** the local `.env` file in the fresh push. The `.env.example` template is safe to include.

```bash
# Verify before push
git check-ignore .env  # Should output ".env"
```

### High Priority (Should Fix) ✅ ALL COMPLETED

#### ~~Code Duplication in Routes~~ ✅ COMPLETED

**Status**: Fixed — Created shared utilities:

- `src/utils/auth.js` — `secureCompare`, `requireAdmin`
- `src/utils/parsing.js` — `parseTags`, `parseBool`

#### ~~Inconsistent Error Handling in keyRequests.js~~ ✅ COMPLETED

**Status**: Fixed — Now uses `ValidationError`, `NotFoundError` from `src/errors/`

#### ~~Replace Deprecated yamljs~~ ✅ COMPLETED

**Status**: Fixed — `yamljs` replaced with `js-yaml` in `src/app.js`

#### ~~pnpm Version Inconsistency~~ ✅ COMPLETED

**Status**: Fixed — `packageManager: "pnpm@10.23.0"` and `engines.node: ">=20.0.0"` added to package.json

#### ~~Documentation Inconsistencies~~ ✅ COMPLETED

**Status**: Fixed — API paths standardized to `/api/v1/`, coverage thresholds corrected, broken link removed

### Medium Priority (Polish) ✅ COMPLETED

#### ~~Missing Standard Config Files~~ ✅ COMPLETED

**Status**: Added `.editorconfig`, `.nvmrc`, `.dockerignore`

#### ~~Package.json Metadata~~ ✅ COMPLETED

**Status**: Professional description and 10 relevant keywords added

#### ~~Untrack Generated SDK~~ ✅ COMPLETED

**Status**: `sdk/` added to `.gitignore`

#### Test Coverage Gaps

Infrastructure components with low coverage:

| Component                   | Coverage | Priority |
| --------------------------- | -------- | -------- |
| `src/services/cache.js`     | 15.74%   | High     |
| `src/middleware/timeout.js` | 65.38%   | Medium   |
| `src/utils/logger.js`       | 61.53%   | Medium   |
| `src/app.js` (integration)  | 58.4%    | Medium   |

Missing tests for `/health`, `/ready`, `/metrics` endpoints as integration tests.

#### Code Clarity Improvements

| Issue                      | Location                                           | Effort |
| -------------------------- | -------------------------------------------------- | ------ |
| Duplicate validation logic | `searchService.js:113-140` duplicated at `241-268` | 30 min |
| Single-letter variables    | `ir`, `dr`, `yr`, `l`, `p` in searchService.js     | 15 min |
| 90-line aggregate method   | `staticScreamsRepository.js:127-217`               | 1 hour |
| Nested ternaries           | `staticScreamsRepository.js:41`                    | 10 min |

### Low Priority (Nice to Have)

- [ ] Organize scripts into subdirectories (`scripts/data/`, `scripts/build/`, `scripts/admin/`)
- [ ] Add barrel exports for `src/services/index.js` and `src/middleware/index.js`
- [ ] Create `tests/helpers/` with shared test utilities
- [ ] Add release automation (semantic-release or release-please)
- [ ] Add Dependabot configuration (`.github/dependabot.yml`)
- [ ] Update GitHub Actions to `pnpm/action-setup@v4`

### Pre-Publish Checklist

Before pushing to organization GitHub:

#### Blockers (CI would fail) ✅ ALL COMPLETED 2025-11-28

- [x] Fix all 21 lint errors — fixed crypto imports, unused vars, empty catches, conditional expects
- [x] Format all 25+ unformatted files — `pnpm run format` applied
- [x] Fix ESLint `sourceType` config — changed `module` → `script` in eslint.config.js
- [x] Fix js-yaml vulnerability — added pnpm override for `js-yaml>=4.1.1`
- [x] Remove `.DS_Store` files from staged content — removed from root, .gitignore covers subdirs
- [x] Remove orphaned CSV from root — deleted `goat_scream_analysis (3).csv`
- [x] Remove `eslint-plugin-node` dependency — removed unused deprecated package

#### High Priority (Professionalism) ✅ ALL COMPLETED 2025-11-28

- [x] Extract duplicated auth/parsing utilities — created `src/utils/auth.js` and `src/utils/parsing.js`
- [x] Fix error handling in `keyRequests.js` — migrated to `ValidationError`, `NotFoundError` classes
- [x] Replace deprecated `yamljs` with `js-yaml` — updated src/app.js to use js-yaml
- [x] Standardize pnpm version — added `packageManager: "pnpm@10.23.0"` to package.json
- [x] Fix documentation inconsistencies — API paths, coverage thresholds, broken links all fixed
- [x] Add `engines` field to package.json — added `"node": ">=20.0.0"`
- [x] Ensure `.env` excluded, `.env.example` included — verified in .gitignore

#### Polish (World-class) ✅ COMPLETED 2025-11-28

- [x] Add `.editorconfig`, `.nvmrc`, `.dockerignore` — all three files created
- [x] Improve package.json description/keywords — professional description and 10 relevant keywords
- [ ] Create v0.1.0 release tag after fresh push
- [x] Update CHANGELOG.md with release notes — comprehensive 0.1.0 release notes added

### Files Requiring Most Attention

| File                                          | Issues                                     | Priority |
| --------------------------------------------- | ------------------------------------------ | -------- |
| `src/services/searchService.js`               | Duplicate validation, poor variable naming | Medium   |
| `src/repositories/staticScreamsRepository.js` | 90-line method                             | Low      |
| `src/services/cache.js`                       | 15.74% test coverage                       | Low      |

**Resolved since audit:**

- ✅ `src/routes/keyRequests.js` — Uses shared auth utilities, proper error handling
- ✅ `src/routes/moderation.js` — Uses shared auth/parsing utilities
- ✅ `eslint.config.js` — sourceType fixed to `script`
- ✅ `package.json` — Has engines field and professional description

### Architectural Strengths (No Changes Needed)

The audit confirmed these areas are production-ready:

- ✅ **Layered Architecture** — Routes → Services → Repositories pattern is clean
- ✅ **Error Handling** — 11 custom error classes with correlation IDs
- ✅ **Repository Pattern** — Factory function for MongoDB/static switching
- ✅ **Security Practices** — Timing-safe comparisons, Helmet, rate limiting
- ✅ **Observability** — Prometheus metrics, structured logging, health probes
- ✅ **Comment Hygiene** — 9.2/10, zero debug leftovers or profanity
- ✅ **No Circular Dependencies** — Import depth max 2 levels

---

## ✅ Completed Foundations (MVP)

- [x] Curated 55 licensed goat screams with `license` metadata, audit/apply scripts, and Cloudinary-hosted media.
- [x] Express + Mongo API with random/ordered/search/stats routes backed by `GoatScream` documents (approved-only surface).
- [x] Cloudinary ingestion tooling (`upload-media`, `audit-screams`, `apply-curation`) and mock dataset fallback.
- [x] Submissions pipeline: file/URL intake, audio analysis stub, Cloudinary staging, Mongo-backed queue, moderation routes.
- [x] Admin moderation actions (approve → promote asset/create `GoatScream`, reject → optional asset cleanup).
- [x] Swagger UI at `/docs`, OpenAPI spec (`docs/openapi.yaml`), and browser playground at `/playground`.
- [x] Automated coverage: Jest + Supertest integration suite (`pnpm test`) using MongoDB Memory Server and mocked Cloudinary.
- [x] Deployment stack: multi-stage Dockerfile, docker-compose (API + Mongo + Mongo Express), CI workflow (install → test → lint OpenAPI → build image).
- [x] `/health` telemetry (db status, submission counts, version/build/commit/uptime) with production request timing logs.

### V1 Polish Achieved

- [x] Moderation runbook (`.internal/docs/moderation-runbook.md`) and reviewer dashboard (`.internal/public/moderation.html`).
- [x] Structured JSON access logging, request IDs, and per-scream access counters (`stats.daily_hits`, `stats.last_accessed_at`).
- [x] Smoke testing script (`pnpm run smoke`) wired into CI alongside API spin-up, plus cron-friendly health check script.
- [x] Contributor documentation (`docs/contributing-screams.md`), API keys runbook (`docs/api-keys.md`), launch checklist, landing page, and FAQ updates.
- [x] API key tiering with custom quotas and CLI management (`scripts/apikeys.js`, middleware-based rate limiting).

### V1 Launch Snapshot (2025-10-22)

- ✅ API deployed on Railway (Pro tier) with MongoDB Atlas + Cloudinary: https://api.bleatbox.dev
- ✅ TLS + custom domain live; `/health`, `/docs/`, and `/playground/` verified over HTTPS
- ✅ Production env vars set: `MONGODB_URI`, granular Cloudinary keys, `ADMIN_TOKEN`, `PORT`, `NODE_ENV=production`
- ✅ Production database restored from local dump (371 approved screams) and parity confirmed via `pnpm run sync:audit`
- ✅ Monitoring in place: GitHub Action (`health-check.yml`) runs `scripts/check-health.js` every 15m (set `HEALTH_URL`/Slack secrets)
- ⬜️ Post-launch comms + API key distribution (see "Post‑V1 Follow-ups" below)

### 🎉 Fun-First Public Track

Lightweight tasks that keep the experience welcoming for hobbyists and tinkerers.

- [x] Publish a static snapshot (`data/screams-public.json`) of approved screams and document the refresh command in `README.md`.
- [x] Add copy-and-paste examples (`curl`, browser link, embed ideas) to the README landing section.
- [x] Fold an MIT/license badge and playful “not affiliated” disclaimer into the README.
- [x] Document a one-click deploy path (Render/Fly/Netlify) for running the API in public read-only mode.
- [x] Create API guide in `docs/` explaining zero-auth usage, rate limits, and contribution tips.

Additional V1 polish (2025-10-27):

- [x] Lock production to default JSON-based API; gate Advanced API features behind `FULL_STACK=true` (dev/demo only).
- [x] Add `export-from-api` script and `pnpm run export:api` for quick snapshot refreshes without local DB.

Latest snapshot refresh: `pnpm run export:api` pulled from the live API on **2025-10-27**, updating `data/screams-public.json` with live Cloudinary URLs.

**Note**: Launch preparation and status tracking has moved to [`LAUNCH_STATUS.md`](../LAUNCH_STATUS.md) for detailed progress tracking.

### Operational Launch TODOs (Opt-in)

Heavier launch tasks that support a more formal announcement; keep them if we’re running a campaign, skip if we’re just celebrating.

**Note**: Launch preparation is now tracked in [`LAUNCH_STATUS.md`](../LAUNCH_STATUS.md) with detailed status, definitions of done, and priority order.

- [x] Verified curated catalog via `node scripts/audit-screams.js` (371 approved entries).
- [x] Run `pnpm test` with Mongo-backed pipeline (2025-10-25); all 279 tests passing. ✅
- [x] Fix OpenAPI spec linting errors ✅ - All duplicate keys, indentation issues, and schema validation errors fixed. Spec now validates successfully.
- [x] Fix smoke test ✅ - Fixed route ordering: `/health` and `/ready` endpoints now defined before static middleware to prevent HTML responses
- [ ] Execute `pnpm run stats:aggregate` and `node scripts/license-audit.js`; investigate anomalies prior to launch. (Optional for default API)
- [ ] Issue production API keys for launch partners using `scripts/apikeys.js`. (Optional; prod runs public read-only)
- [ ] Configure cron/monitoring jobs with `node scripts/check-health.js` targeting production. (De-scoped for default API)
- [x] Finalize landing page copy in `public/index.html` (pricing tiers, contact, feedback section, AI Matey credit). ✅
- [x] Launch content prepared: Product Hunt listing, social posts, maker comment, visual assets resized to PH specs. ✅ (See `launch/` folder)
- [ ] Publish launch blog post, newsletter, and scheduled social posts (content ready in `launch/written-content.md`).
- [x] Visual assets created and resized for Product Hunt (thumbnail, gallery images, header). ✅ (See `launch/ph-assets/`)
- [ ] Assemble press kit (logo, Swagger screenshots, sample audio bundle) and circulate to partners.
- [ ] Notify beta partners with API keys and onboarding instructions aligned with the comms plan. (Optional)
- [ ] Share moderation runbook/dashboard access with reviewers and confirm launch-week coverage. (Optional)
- [ ] Stand up analytics dashboards for logs, Cloudinary usage, and traffic trends. (Optional)
- [ ] Confirm support channels (email/Slack) and escalation procedure for launch week. (Optional)

### Public Exposure (Prod)

- ✅ Deployed to Railway (containerized via Dockerfile) with `api.bleatbox.dev` fronted by Railway-managed TLS
- ✅ Production env configured (Atlas URI, Cloudinary keys, `ADMIN_TOKEN`, rate-limit defaults)
- ✅ `curl https://api.bleatbox.dev/health` returns `db.connected: true`
- ✅ `/docs/` and `/playground/` reachable publicly
- ✅ Monitoring/alerts: GitHub Action runs scheduled health check with optional Slack webhook
- ⬜️ Review rate-limit defaults after first week of traffic; adjust via env if usage spikes

Default API notes (2025-10-27): Production serves the static snapshot; Mongo is not required. Advanced API features are intended for development and demos only.

## 🎯 Post‑V1 Follow‑ups

- [x] Expand curated catalog to ~100+ screams (371 approved; continue enrichment loop for tags/meme status/attribution).
- [ ] Provenance polish (optional fields and periodic license audit runs).
- [ ] Dashboards (optional): ship Loki/ELK or Grafana docs + sample queries.
- [ ] Monitoring/alerts (optional): schedule health checks and usage thresholds.
- [ ] Onboarding experiments (optional): lightweight self‑serve portal.

Developer Experience follow-ups (zero-maintenance friendly):

- [ ] Add `examples/keyboard-web` (vanilla JS goat keyboard) and `examples/beat-maker` (minimal 8-step sequencer).
- [ ] Add a 10‑minute tutorial: “Build a browser soundboard.”

#### Operational Routines (Opt-in)

- Daily/weekly:
  - `node scripts/audit-screams.js`
  - Review `/api/v1/moderation` queue; promote high‑quality clips promptly
- Monthly:
  - `node scripts/license-audit.js` and `pnpm run stats:aggregate`

## 🚀 Advanced / V2 Ideas

- Automations:
  - Audio fingerprinting or ML-based scream classification to auto-rank intensity/emotion.
  - Submission similarity detection (avoid duplicates, surface related screams).
- Product features:
  - Streaming snippets or stitched soundboards (“BleatBox”).
  - Chrome/desktop extensions (Pomodoro goat, keyboard macros).
  - “BleatGPT” prompt-powered scream suggestions or conversational API.
  - Premium tier with higher rate limits, webhook notifications, or curated bundles.
- Media pipeline:
  - Integrate ElevenLabs-style text-to-bleat generation or Sora/Veo video remixes.
  - Auto-generate waveform visualizations/gifs for sharing.
- Platform & Ops:
  - Webhooks on approval, Slack/Discord alerts for new submissions, public status page.
  - Observability stack (Prometheus/Grafana or third-party metrics) and log retention policy.

### Product/Experience Ideas Backlog

1. Pomodoro Goat Scream Chrome Extension
2. BleatGPT
3. ElevenLabs DIY Scream
4. BleatBox (interactive soundboard)
5. Sora2 / Veo ScreamVideos (auto-generated video snippets)
6. BleatSupport (customer support sound replies)
7. ScreamRatings (crowd-sourced intensity/fear/fun scores)

## Operational Notes

Keep these routines if you're running the Advanced API setup; the default API can ignore them unless you're curious.

- Daily/weekly:
  - Run `node scripts/audit-screams.js` to ensure curated catalog stays clean.
  - Review pending submissions via `/api/v1/moderation` or future dashboard; promote high-quality clips quickly.
- Env/config:
  - Required: `MONGODB_URI`, `CLOUDINARY_URL` (or individual keys), `ADMIN_TOKEN`, optional rate-limit overrides.
  - Local dev: `pnpm install`, `pnpm run dev`, Mongo via docker-compose.
- Launch checklist:
  - Populate curated catalog, stage marketing assets, dry-run docker-compose in staging, configure CDN caching (Cloudinary or future CDN).
  - Use `pnpm run smoke` before deployments and schedule `scripts/check-health.js` for ongoing monitoring.
  - Issue API keys via `node scripts/apikeys.js` and keep `docs/api-keys.md` updated as tiers evolve.

_Last updated: 2025-11-28_ (All High Priority and Polish items completed. Ready for v0.1.0 release.)
