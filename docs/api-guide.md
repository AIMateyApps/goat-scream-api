# API Guide

The Goat Screams API serves a static JSON snapshot from `data/screams-public.json`. It requires no MongoDB or Cloudinary credentials at runtime and is designed to stay online without babysitting.

## TL;DR

1. `pnpm install`
2. Edit `data/screams-public.json` directly (or use an existing snapshot)
3. `pnpm run dev` (or `pnpm start`) – the server boots with the snapshot
4. Hit `http://localhost:3000/api/v1/screams/random` and enjoy the chaos

## Working with the JSON Snapshot

The production dataset lives at `data/screams-public.json`. This is your source of truth—the API serves this file directly.

### Adding or Updating Screams

**Edit JSON directly:**

1. Open `data/screams-public.json`
2. Add or modify scream entries
3. Commit: `git add data/screams-public.json && git commit`
4. Deploy

**Optional: Refresh from live API** (no MongoDB needed):

```bash
pnpm run export:api  # Pulls from live API → JSON snapshot
```

**Optional: Export from MongoDB** (only if Advanced API is enabled):

```bash
pnpm run export:fun  # Exports from MongoDB → JSON snapshot
```

See [`docs/sync-workflow.md`](sync-workflow.md) for details on MongoDB sync workflows (when enabled).

## Deploying the API

Any Node-friendly host works. Here's a Render example:

1. Fork the repo and push the refreshed `data/screams-public.json`.
2. Create a **Web Service** in Render pointing at the repo.
3. Build command: `pnpm install --frozen-lockfile`
4. Start command: `pnpm start`
5. Environment variables: none required (omit `MONGODB_URI` to use the default JSON-based API).

Want the same on Fly.io? Use their Node builder:

```
fly launch --no-deploy
fly secrets unset MONGODB_URI CLOUDINARY_URL ADMIN_TOKEN
fly deploy --build-arg NODE_ENV=production
```

Because the API doesn't write to disk or talk to external services at runtime, the cheapest tiers typically cover it.

## Using the Snapshot Elsewhere

- The JSON file lives at `data/screams-public.json`.
- Import it into front-end experiments (`import screams from '.../data/screams-public.json' assert { type: 'json' };`).
- Build tiny apps (soundboards, keyboards, chat bots) without touching the API server at all.

## Enabling Advanced API Features

When you're ready for submissions, moderation, and MongoDB-backed features:

1. Set environment variables: `FULL_STACK=true`, `MONGODB_URI`, `CLOUDINARY_URL`, `ADMIN_TOKEN`
2. Start the server – routes automatically switch to MongoDB-backed queries
3. Keep the JSON snapshot for offline demos or to populate seeds

**Setup guide:** [`docs/enable-advanced-api.md`](enable-advanced-api.md)

The MongoDB code is already in the repo—just enable it when needed. The default API configuration works perfectly without any database.
