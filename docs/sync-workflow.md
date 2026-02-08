# Sync Workflow Reference

This document explains how to keep MongoDB and the JSON snapshot (`data/screams-public.json`) in sync when Advanced API features are enabled.

## Mental Model

- **JSON snapshot** = Production source of truth (what users hit)
- **MongoDB** = Staging area (when Advanced API is enabled)
- **Cloudinary** = Media storage (always)

## When MongoDB is Enabled

Advanced API setup (`FULL_STACK=true`) enables MongoDB-backed routes. In this mode, MongoDB acts as a staging area where you can add/modify screams before exporting to the JSON snapshot.

## Sync Workflows

### Adding New Screams

1. **Upload media to Cloudinary:**

   ```bash
   node scripts/upload-media.js --from-curation
   ```

   This reads from `data/curated-screams.csv` and `data/curated-ai.csv`, uploads audio to Cloudinary, and inserts/updates documents in MongoDB.

2. **Export to JSON snapshot:**

   ```bash
   pnpm run export:fun
   ```

   This pulls approved screams from MongoDB and writes them to `data/screams-public.json`.

3. **Commit the snapshot:**

   ```bash
   git add data/screams-public.json
   git commit -m "Add new screams"
   ```

4. **Deploy:**
   The API serves the JSON snapshot; MongoDB is optional at runtime.

### Updating Existing Screams

**Option A: Edit MongoDB directly**

1. Connect to MongoDB (via `mongosh`, MongoDB Compass, or admin UI)
2. Update the document(s) you want to change
3. Export: `pnpm run export:fun`
4. Commit: `git add data/screams-public.json && git commit`

**Option B: Edit JSON and import to MongoDB**

1. Edit `data/screams-public.json` directly
2. Use `scripts/upload-media.js` with `--update-existing` flag (if implemented)
3. Or manually sync changes to MongoDB if needed

### Quick Refresh from Live API

If you have a live API running and want to refresh the snapshot without MongoDB:

```bash
pnpm run export:api
```

This pulls from the live API endpoint (defaults to `https://api.goatscreams.com`) and writes to `data/screams-public.json`. Useful when you don't have local MongoDB access.

## Export Scripts Explained

### `export-public-screams.js` (`pnpm run export:fun`)

**Purpose:** Export from MongoDB to JSON snapshot

**Behavior:**

- If `MONGODB_URI` is set: Connects to MongoDB, exports approved screams
- If `MONGODB_URI` is not set: Falls back to `mock-data/sample-screams.js`

**When to use:**

- After adding/modifying screams in MongoDB
- When syncing MongoDB → JSON for production

### `export-from-api.js` (`pnpm run export:api`)

**Purpose:** Pull from live API endpoint to JSON snapshot

**Behavior:**

- Makes HTTP requests to `/api/v1/search` endpoint
- Paginates through all results
- Writes to `data/screams-public.json`

**When to use:**

- Quick refresh without local MongoDB
- Syncing from production API to local snapshot
- No MongoDB connection required

**Configuration:**

- `EXPORT_API_BASE`: API base URL (default: `https://api.goatscreams.com`)
- `EXPORT_PAGE_SIZE`: Page size for pagination (default: `100`)

## Default API Workflow (No MongoDB)

When MongoDB is **not** enabled (default API):

1. **Edit JSON directly:** `data/screams-public.json`
2. **Commit:** `git add data/screams-public.json && git commit`
3. **Deploy:** Done

No sync needed—the JSON file is the source of truth.

## Validation (Optional)

If you want to verify sync alignment when MongoDB is enabled, you can add a validation script:

```bash
node scripts/validate-sync.js
```

This would check:

- JSON count matches MongoDB approved count
- No placeholder URLs in JSON
- Suggests sync command if drift detected

(Note: This script is optional and not included by default. See the plan for implementation details.)

## Best Practices

1. **Commit JSON snapshot regularly** - It's your production source of truth
2. **Use MongoDB for staging** - When Advanced API is enabled, use MongoDB as a staging area
3. **Export before deploying** - Always export MongoDB → JSON before deploying if MongoDB was modified
4. **Keep JSON readable** - Use `JSON.stringify(data, null, 2)` for pretty formatting

## Related Documentation

- [`docs/enable-advanced-api.md`](enable-advanced-api.md) - How to enable Advanced API features
- [`docs/api-guide.md`](api-guide.md) - Default API workflow (JSON-based)
