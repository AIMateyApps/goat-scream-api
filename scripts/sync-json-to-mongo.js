#!/usr/bin/env node

/**
 * Sync all approved screams from JSON snapshot to MongoDB
 * Ensures MongoDB has all screams that exist in the JSON snapshot
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const GoatScream = require('../src/models/GoatScream');

const JSON_PATH = path.resolve(__dirname, '../data/screams-public.json');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  if (!fs.existsSync(JSON_PATH)) {
    console.error(`JSON snapshot not found: ${JSON_PATH}`);
    process.exit(1);
  }

  console.log('Loading JSON snapshot...');
  const jsonData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  console.log(`Found ${jsonData.length} screams in JSON snapshot`);

  // Filter to only approved screams
  const approvedScreams = jsonData.filter(s => s.approved !== false);
  console.log(`Approved screams: ${approvedScreams.length}`);

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  console.log('\nSyncing screams to MongoDB...\n');

  for (const scream of approvedScreams) {
    try {
      // Ensure approved is set
      const doc = {
        ...scream,
        approved: true,
      };

      // Upsert by id
      const res = await GoatScream.updateOne({ id: doc.id }, { $set: doc }, { upsert: true });

      if (res.upsertedCount > 0) {
        inserted += 1;
      } else if (res.matchedCount > 0) {
        updated += 1;
      } else {
        skipped += 1;
      }
    } catch (err) {
      errors.push({ id: scream.id, error: err.message });
      console.error(`Error syncing ${scream.id}:`, err.message);
    }
  }

  console.log('\n=== Sync Summary ===');
  console.log(`Total processed: ${approvedScreams.length}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);

  if (errors.length > 0) {
    console.error(`\nErrors (${errors.length}):`);
    errors.forEach(({ id, error }) => console.error(`  - ${id}: ${error}`));
  }

  // Verify final count
  const finalCount = await GoatScream.countDocuments({ approved: true });
  console.log(`\nFinal MongoDB count (approved): ${finalCount}`);

  if (finalCount === approvedScreams.length) {
    console.log('✓ Sync complete! All approved screams are in MongoDB.');
  } else {
    console.warn(`⚠ Count mismatch: Expected ${approvedScreams.length}, got ${finalCount}`);
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
