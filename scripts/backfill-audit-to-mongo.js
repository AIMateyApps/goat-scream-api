#!/usr/bin/env node

/**
 * Backfill audit metadata to MongoDB for ALL screams (approved + unapproved)
 * Uses audit CSV and original JSON data to ensure all screams have audit data
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const mongoose = require('mongoose');
const GoatScream = require('../src/models/GoatScream');

const CSV_PATH = path.resolve(__dirname, '../docs/goat-screams-audit-2025-11-05.csv');

function parseYesNo(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() === 'yes'
  );
}

function buildAuditMetadata(row) {
  const updatedAt = row.updated_at ? new Date(row.updated_at) : new Date();

  return {
    audited: parseYesNo(row.audited),
    good: parseYesNo(row.good),
    bad_not_scream: parseYesNo(row.bad_not_scream),
    bad_bad_edit: parseYesNo(row.bad_bad_edit),
    other_issue: parseYesNo(row.other_issue),
    needs_follow_up: parseYesNo(row.needs_follow_up),
    comments: row.comments?.trim() || undefined,
    updated_at: updatedAt,
  };
}

function shouldApprove(row) {
  return parseYesNo(row.good);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Audit CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  console.log('Loading audit CSV...');
  const csvRaw = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parse(csvRaw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Found ${rows.length} audit entries`);

  // Get original JSON (before filtering) from git
  console.log('Loading original JSON from git...');
  const { execSync } = require('child_process');
  let originalJson = [];
  try {
    const jsonBeforeFilter = execSync(`git show HEAD~1:data/screams-public.json`, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    originalJson = JSON.parse(jsonBeforeFilter);
    console.log(`Loaded ${originalJson.length} screams from original JSON`);
  } catch {
    console.warn('Could not load original JSON from git, will reconstruct from CSV');
  }

  const originalJsonMap = new Map(originalJson.map(s => [s.id, s]));

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);

  const existingMongoDocs = await GoatScream.find({}).lean();
  const mongoMap = new Map(existingMongoDocs.map(d => [d.id, d]));

  let inserted = 0;
  let updated = 0;
  let approved = 0;
  let unapproved = 0;
  const errors = [];

  console.log('\nSyncing all screams with audit data to MongoDB...\n');

  for (const row of rows) {
    const id = row.id?.trim();
    if (!id) continue;

    try {
      const auditMetadata = buildAuditMetadata(row);
      const shouldApproveValue = shouldApprove(row);

      // Get existing scream data (priority: original JSON > MongoDB > reconstruct from CSV)
      let screamData = originalJsonMap.get(id) || mongoMap.get(id);

      if (!screamData) {
        // Reconstruct minimal data from CSV
        screamData = {
          id,
          title: row.title || id,
          source_type: row.source_type || 'viral_video',
          year: row.year ? parseInt(row.year, 10) : undefined,
          audio: {
            duration: row.duration_seconds ? parseFloat(row.duration_seconds) : undefined,
            intensity: row.intensity ? parseInt(row.intensity, 10) : undefined,
          },
          media: {
            audio: {
              mp3: {
                medium: row.audio_url || undefined,
              },
            },
          },
          tags: row.tags ? row.tags.split('|').filter(Boolean) : [],
          source: {
            title: row.source_title || undefined,
            platform: row.source_platform || undefined,
          },
        };
      }

      // Merge audit data
      const doc = {
        ...screamData,
        approved: shouldApproveValue,
        audit: auditMetadata,
      };

      // Remove MongoDB internal fields
      delete doc._id;
      delete doc.__v;

      const res = await GoatScream.updateOne({ id }, { $set: doc }, { upsert: true });

      if (res.upsertedCount > 0) {
        inserted += 1;
      } else if (res.matchedCount > 0) {
        updated += 1;
      }

      if (shouldApproveValue) {
        approved += 1;
      } else {
        unapproved += 1;
      }
    } catch (err) {
      errors.push({ id, error: err.message });
      console.error(`Error processing ${id}:`, err.message);
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total processed: ${rows.length}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated: ${updated}`);
  console.log(`Approved: ${approved}`);
  console.log(`Unapproved: ${unapproved}`);

  if (errors.length > 0) {
    console.error(`\nErrors (${errors.length}):`);
    errors.slice(0, 10).forEach(({ id, error }) => console.error(`  - ${id}: ${error}`));
  }

  // Verify final counts
  const totalInMongo = await GoatScream.countDocuments({});
  const approvedInMongo = await GoatScream.countDocuments({ approved: true });
  const unapprovedInMongo = await GoatScream.countDocuments({ approved: false });
  const withAudit = await GoatScream.countDocuments({ 'audit.audited': true });

  console.log('\n=== MongoDB Status ===');
  console.log(`Total screams: ${totalInMongo}`);
  console.log(`Approved: ${approvedInMongo}`);
  console.log(`Unapproved: ${unapprovedInMongo}`);
  console.log(`With audit data: ${withAudit}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
