# Enabling Advanced API Features

Advanced API setup unlocks MongoDB-backed features like user submissions and moderation workflows. This guide walks you through enabling it.

## Quick Overview

**Default API:**

- Serves static JSON from `data/screams-public.json`
- Zero runtime dependencies
- All public routes work: `/api/v1/screams/*`, `/api/v1/search`, `/api/v1/stats`

**Advanced API (Optional):**

- Requires MongoDB connection
- Adds `/api/v1/submissions` and `/api/v1/moderation` routes
- Enables community contributions and moderation workflows

## Step-by-Step Setup

### 1. Set Up MongoDB

Choose one:

**Option A: MongoDB Atlas (Cloud)**

1. Sign up at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Get your connection string (looks like `mongodb+srv://user:pass@cluster.mongodb.net/dbname`)

**Option B: Local MongoDB**

1. Install MongoDB locally or use Docker:
   ```bash
   docker run -d -p 27017:27017 --name mongodb mongo:latest
   ```
2. Connection string: `mongodb://localhost:27017/goats`

### 2. Configure Environment Variables

Create or update your `.env` file:

```bash
# Required for Advanced API features
FULL_STACK=true
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/goats

# Optional but recommended
CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name
ADMIN_TOKEN=your-secret-admin-token-here
```

**Important:** The server only connects to MongoDB when `FULL_STACK=true` is explicitly set. Without it, the API serves the JSON snapshot even if `MONGODB_URI` is present.

### 3. Start the Server

```bash
pnpm install
pnpm run dev
```

You should see:

```
Connected to MongoDB at mongodb+srv://[redacted]@cluster.mongodb.net/goats
```

If you see a message about serving the static dataset instead, check that `FULL_STACK=true` is set correctly.

### 4. Verify Advanced Routes

**Submissions endpoint:**

```bash
curl http://localhost:3000/api/v1/submissions
# Should return JSON (empty array if no submissions yet)
```

**Moderation endpoint (requires admin token):**

```bash
curl -H "x-admin-token: your-secret-admin-token-here" \
  http://localhost:3000/api/v1/moderation/submissions
# Should return moderation queue
```

If these routes return `503 Service Unavailable`, the advanced features aren't enabled. Check your environment variables.

## What Routes Become Available?

### `/api/v1/submissions` (POST, GET)

- **POST**: Accept user-submitted goat screams
- **GET**: List submissions (admin only)
- Requires: MongoDB connection

### `/api/v1/moderation/*` (Admin only)

- **GET `/api/v1/moderation/submissions`**: View submission queue
- **PATCH `/api/v1/moderation/submissions/:id/approve`**: Approve and promote a submission
- **PATCH `/api/v1/moderation/submissions/:id/reject`**: Reject a submission
- Requires: MongoDB connection + `ADMIN_TOKEN` header

## Sync Workflow (When MongoDB is Enabled)

When Advanced API is active, you can sync MongoDB data to the JSON snapshot:

### Adding New Screams

1. Upload to Cloudinary: `node scripts/upload-media.js --from-curation`
2. Screams are inserted into MongoDB automatically
3. Export snapshot: `pnpm run export:fun`
4. Commit: `git add data/screams-public.json && git commit`

### Updating Existing Screams

1. Edit MongoDB documents directly (via mongo shell or admin UI)
2. Export snapshot: `pnpm run export:fun`
3. Commit changes

### Export Commands

**From MongoDB:**

```bash
pnpm run export:fun
# Exports approved screams from MongoDB → data/screams-public.json
```

**From Live API:**

```bash
pnpm run export:api
# Pulls from live API endpoint → data/screams-public.json
# Useful for quick refreshes without local MongoDB
```

## Disabling Advanced Features

To return to the default JSON-based API:

1. Remove or unset `FULL_STACK=true` from `.env`
2. Restart the server
3. Routes will switch back to serving static JSON

The MongoDB code stays in the repo, ready to enable again when needed.

## Troubleshooting

**Advanced features not working even with `FULL_STACK=true`:**

- Check that `MONGODB_URI` is set correctly
- Verify MongoDB is reachable (test connection string separately)
- Check server logs for connection errors

**Submissions route returns 503:**

- Ensure `FULL_STACK=true` is set
- Verify MongoDB connection is successful
- Check that `getDbStatus().connected` is `true` in server logs

**Moderation routes return 401:**

- Set `ADMIN_TOKEN` in `.env`
- Include `x-admin-token` header in requests

## Related Documentation

- [`docs/api-guide.md`](api-guide.md) - Default API workflow (JSON-based)
- [`docs/sync-workflow.md`](sync-workflow.md) - Detailed sync process reference
- [`docs/roadmap.md`](roadmap.md) - Project roadmap and features
- [`docs/moderation-runbook.md`](moderation-runbook.md) - Moderation best practices
