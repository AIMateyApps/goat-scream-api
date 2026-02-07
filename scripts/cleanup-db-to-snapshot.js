#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const mongoose = require('mongoose');
const GoatScream = require('../src/models/GoatScream');

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri, dbName ? { dbName } : {});
}

function loadSnapshotIds(snapshotPath) {
  const file = snapshotPath || path.resolve(__dirname, '../data/screams-public.json');
  if (!fs.existsSync(file)) throw new Error(`Snapshot not found at ${file}`);
  const arr = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const ids = new Set(arr.map(x => x.id));
  return { file, count: arr.length, ids };
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('apply', { type: 'boolean', default: false, describe: 'Execute deletions' })
    .option('snapshot', {
      type: 'string',
      describe: 'Path to snapshot JSON (defaults to data/screams-public.json)',
    })
    .help().argv;

  const { file, count: snapshotCount, ids: snapshotIds } = loadSnapshotIds(argv.snapshot);
  await connectMongo();

  const docs = await GoatScream.find({}, { id: 1 }).lean();
  const dbIds = docs.map(d => d.id);
  const extras = dbIds.filter(id => !snapshotIds.has(id));

  const result = {
    snapshot_path: file,
    snapshot_count: snapshotCount,
    db_count: dbIds.length,
    extra_in_db: extras.length,
    sample_extra: extras.slice(0, 20),
  };
  console.log(JSON.stringify(result, null, 2));

  if (argv.apply && extras.length) {
    const res = await GoatScream.deleteMany({ id: { $in: extras } });
    console.log(JSON.stringify({ deleted: res.deletedCount || 0 }, null, 2));
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
