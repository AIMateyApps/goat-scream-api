#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const mongoose = require('mongoose');
const GoatScream = require('../src/models/GoatScream');

const argv = yargs(hideBin(process.argv))
  .option('file', {
    alias: 'f',
    type: 'string',
    default: path.join(process.cwd(), 'data/curated-screams.csv'),
    describe: 'Path to curated screams CSV',
  })
  .option('dry-run', {
    type: 'boolean',
    default: false,
    describe: 'Preview updates without writing to Mongo',
  })
  .help()
  .alias('h', 'help').argv;

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'y'].includes(v);
  }
  return false;
}

function parseTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value
    .split(/[,|]/)
    .map(tag => tag.trim())
    .filter(Boolean);
}

async function main() {
  const csvPath = argv.file;
  if (!fs.existsSync(csvPath)) {
    console.error(`Curation file not found: ${csvPath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (!rows.length) {
    console.error('No rows found in curation CSV');
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);

  let updated = 0;
  const missing = [];
  const now = new Date();

  for (const row of rows) {
    const id = row.id;
    if (!id) {
      console.warn('Skipping row without id', row);
      continue;
    }
    const doc = await GoatScream.findOne({ id });
    if (!doc) {
      missing.push(id);
      continue;
    }

    const set = {
      title: row.title || doc.title,
      source_type: row.source_type || doc.source_type,
      year: row.year ? Number(row.year) : doc.year,
      meme_status: row.meme_status || doc.meme_status || 'emerging',
      tags: parseTags(row.tags).length ? parseTags(row.tags) : doc.tags,
      approved: parseBool(row.approved),
      last_curated_at: now,
      'audio.intensity': row.intensity ? Number(row.intensity) : doc.audio?.intensity,
      license: {
        type: row.license_type || doc.license?.type || 'unknown',
        url: row.license_url || doc.license?.url,
        attribution_required: parseBool(
          row.attribution_required ?? doc.license?.attribution_required
        ),
        attribution_text: row.attribution_text || doc.license?.attribution_text,
        notes: row.notes || doc.license?.notes,
      },
    };

    if (argv['dry-run']) {
      console.log(`[dry-run] Would update ${id}`);
      continue;
    }

    await GoatScream.updateOne({ id }, { $set: set });
    updated += 1;
  }

  console.log(`Processed ${rows.length} rows. Updated ${updated}. Missing ${missing.length}.`);
  if (missing.length) {
    console.warn('IDs not found:', missing.join(', '));
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
