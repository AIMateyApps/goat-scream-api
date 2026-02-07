#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const GoatScream = require('../src/models/GoatScream');
const sampleScreams = require('../mock-data/sample-screams');

const OUTPUT_PATH = path.resolve(__dirname, '../data/screams-public.json');

// Help text
function showHelp() {
  console.log(`
Export approved screams from MongoDB to JSON snapshot.

Usage:
  node scripts/export-public-screams.js [--help]

Environment Variables:
  MONGODB_URI          MongoDB connection string (optional)
                       If set, exports from MongoDB
                       If not set, falls back to mock-data/sample-screams.js

Output:
  Writes to data/screams-public.json

When to use:
  - After adding/modifying screams in MongoDB (when Advanced API is enabled)
  - When syncing MongoDB → JSON snapshot for production
  - Part of the sync workflow documented in docs/sync-workflow.md

See also:
  - pnpm run export:api   Export from live API (no MongoDB needed)
  - docs/enable-advanced-api.md   How to enable Advanced API features
  - docs/sync-workflow.md       Sync process reference
`);
  process.exit(0);
}

// Check for --help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
}

function sanitize(doc) {
  if (!doc) return null;
  const { _id: _unusedId, __v: _unusedV, stats, approved, last_curated_at, audit, ...rest } = doc;
  return {
    ...rest,
    stats: {
      api_calls: stats?.api_calls ?? 0,
      downloads: stats?.downloads ?? 0,
      favorites: stats?.favorites ?? 0,
    },
    approved: approved ?? true,
    last_curated_at: last_curated_at || undefined,
    audit: audit || undefined, // Preserve audit metadata
  };
}

async function fetchFromDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  try {
    await mongoose.connect(uri);
    const docs = await GoatScream.find({ approved: true }).sort({ date_added: 1 }).lean();
    await mongoose.disconnect();
    return docs.map(sanitize);
  } catch (err) {
    console.warn(`Failed to export from MongoDB: ${err.message}`);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors
    }
    return null;
  }
}

async function main() {
  const uriSet = !!process.env.MONGODB_URI;
  let dataset = await fetchFromDatabase();
  const fromMongo = Array.isArray(dataset) && dataset.length > 0;

  if (uriSet && !fromMongo) {
    throw new Error(
      'MONGODB_URI is set but failed to export from MongoDB. Aborting to avoid writing placeholder links.'
    );
  }

  if (!fromMongo) {
    dataset = sampleScreams.map(item => sanitize({ ...item }));
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(dataset, null, 2));
  console.log(`Exported ${dataset.length} screams to ${OUTPUT_PATH}`);
  console.log(`Source: ${fromMongo ? 'MongoDB (approved screams)' : 'mock-data/sample-screams'}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
