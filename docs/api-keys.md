# API Keys & Rate Limits

## Tiers

- **Public (no key):** 100 requests per minute.
- **Basic:** default tier for issued keys, 200 requests per minute.
- **Pro:** premium tier, 600 requests per minute.

Each key stores its own per-minute quota; adjust with the CLI as needed.

## Managing Keys

Create, list, or disable keys using the helper script:

```
node scripts/apikeys.js create --label "partner-demo" --tier pro --quota 600
node scripts/apikeys.js list
node scripts/apikeys.js disable --key gsa_...
node scripts/apikeys.js request:list
node scripts/apikeys.js request:approve --id <requestId> --tier basic
```

The CLI requires `MONGODB_URI` to be set in your environment.

## Using Keys

Clients send the header `x-api-key: <key>` with every request. Successful calls return `X-Request-Id` headers for tracing. Exceeding the quota returns HTTP 429.

## Rotation & Security

- Keys are stored hashed only in the database? (Current implementation stores raw strings; plan to hash in future.)
- Revoke keys by setting status to `disabled` via the CLI.
- Log usage: each request updates `last_used_at` and daily counters; monitor via Mongo queries.

## Request Workflow

- Prospective users fill out `/api-key-request.html`, which posts to `/api/v1/keys/requests`.
- Review requests with `node scripts/apikeys.js request:list` or `GET /api/v1/keys/requests` (requires `x-admin-token`).
- Approve in CLI (`request:approve`) to generate a key and mark the request as approved. The CLI prints the new key for sharing.

## Launch Distribution

- Queue announcement assets in `.internal/docs/launch-comms.md`.
- Pre-create keys for launch partners via `node scripts/apikeys.js create --tier pro` and share using the welcome email template from the comms doc.
- After the public announcement, triage inbound form submissions twice daily and track issued tiers in the CRM/notion board.

_Last updated: 2025-10-23_
