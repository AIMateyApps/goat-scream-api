#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const GoatScream = require('../../src/models/GoatScream');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const result = await GoatScream.updateMany(
    { $or: [{ license: { $exists: false } }, { 'license.type': { $exists: false } }] },
    {
      $set: {
        license: {
          type: 'unknown',
          attribution_required: false,
        },
      },
    }
  );

  console.log(`Updated ${result.modifiedCount} records to include license stub`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
