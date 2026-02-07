#!/usr/bin/env node
/*
  Seed MongoDB with mock goat screams.
  Usage:
    MONGODB_URI='mongodb://localhost/goatscreams' node scripts/seed.js
*/

require('dotenv').config();
const { connectMongo } = require('../src/db/connection');
const GoatScream = require('../src/models/GoatScream');
const mock = require('../mock-data/sample-screams');

async function run() {
  const status = await connectMongo();
  if (!status.connected) {
    console.error('Mongo connection failed:', status.error || 'unknown');
    process.exit(1);
  }

  let inserted = 0;
  let updated = 0;

  for (const doc of mock) {
    // Upsert by id
    const res = await GoatScream.updateOne({ id: doc.id }, { $setOnInsert: doc }, { upsert: true });
    if (res.upsertedCount && res.upsertedCount > 0) inserted += 1;
    else if (res.matchedCount && res.matchedCount > 0) updated += 1;
  }

  console.log(`Seed complete. Inserted: ${inserted}, existing matched: ${updated}`);
  process.exit(0);
}

run().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
