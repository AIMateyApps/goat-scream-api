#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const OUTPUT_PATH = path.resolve(__dirname, '../data/screams-public.json');
const API_BASE = process.env.EXPORT_API_BASE || 'https://api.bleatbox.dev';
const PAGE_SIZE = Number(process.env.EXPORT_PAGE_SIZE || 100);

// Help text
function showHelp() {
  console.log(`
Export screams from live API endpoint to JSON snapshot.

Usage:
  node scripts/export-from-api.js [--help]

Environment Variables:
  EXPORT_API_BASE      API base URL (default: https://api.bleatbox.dev)
  EXPORT_PAGE_SIZE     Page size for pagination (default: 100)

Output:
  Writes to data/screams-public.json

When to use:
  - Quick refresh without local MongoDB
  - Syncing from production API to local snapshot
  - No MongoDB connection required

See also:
  - pnpm run export:fun   Export from MongoDB (requires MONGODB_URI)
  - docs/api-guide.md     Default API workflow (JSON-based)
  - docs/sync-workflow.md Sync process reference
`);
  process.exit(0);
}

// Check for --help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
}

async function fetchPage(page) {
  const url = `${API_BASE}/api/search?limit=${PAGE_SIZE}&page=${page}&sort_by=year`;
  const res = await axios.get(url, {
    timeout: 20000,
    headers: { 'User-Agent': 'export-from-api/1.0' },
  });
  if (!res.data || !Array.isArray(res.data.items)) {
    throw new Error(`Unexpected response shape from ${url}`);
  }
  return res.data;
}

async function main() {
  const items = [];
  let page = 1;
  let total = null;

  // Pull pages until we have all items or a short page is returned
  // Cap at 10k to avoid accidental infinite loops
  for (; page < 10000; page += 1) {
    const data = await fetchPage(page);
    if (total == null) total = data.total;
    items.push(...data.items);
    if (data.items.length < PAGE_SIZE || items.length >= total) break;
  }

  if (!items.length) {
    throw new Error('No items fetched from API; aborting.');
  }

  // Write pretty JSON
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(items, null, 2));
  console.log(`Exported ${items.length} screams to ${OUTPUT_PATH}`);
  console.log(`Source: ${API_BASE} (public API)`);

  // Quick validation: ensure no placeholder URLs remain
  const placeholderCount = items.reduce((acc, s) => {
    const formats = s.media?.audio || {};
    const urls = Object.values(formats).flatMap(q => Object.values(q || {}));
    return acc + urls.filter(u => typeof u === 'string' && u.includes('example.com')).length;
  }, 0);
  if (placeholderCount > 0) {
    console.warn(`Warning: ${placeholderCount} placeholder URLs detected in export.`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
