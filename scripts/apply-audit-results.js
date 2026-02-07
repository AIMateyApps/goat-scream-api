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
    default: path.join(process.cwd(), 'docs/goat-screams-audit-2025-11-05.csv'),
    describe: 'Path to audit CSV file',
  })
  .option('dry-run', {
    type: 'boolean',
    default: false,
    describe: 'Preview updates without writing to MongoDB',
  })
  .help()
  .alias('h', 'help').argv;

/**
 * Parse boolean from CSV value (yes/empty)
 */
function parseYesNo(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() === 'yes'
  );
}

/**
 * Determine if a scream should be approved based on audit CSV row
 * @param {Object} row - CSV row with audit data
 * @returns {boolean} true if scream should be approved (marked as "good")
 */
function shouldApprove(row) {
  return parseYesNo(row.good);
}

/**
 * Build audit metadata object from CSV row
 * @param {Object} row - CSV row with audit data
 * @returns {Object} Audit metadata object
 */
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

async function main() {
  const csvPath = argv.file;
  if (!fs.existsSync(csvPath)) {
    console.error(`Audit CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Reading audit CSV from: ${csvPath}`);

  const csvRaw = fs.readFileSync(csvPath, 'utf8');
  const rows = parse(csvRaw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (!rows.length) {
    console.error('No rows found in audit CSV');
    process.exit(1);
  }

  console.log(`Found ${rows.length} audit entries`);

  // Validate required columns
  const requiredColumns = ['id', 'good'];
  const firstRow = rows[0];
  const missingColumns = requiredColumns.filter(col => !(col in firstRow));
  if (missingColumns.length > 0) {
    console.error(`Missing required columns: ${missingColumns.join(', ')}`);
    process.exit(1);
  }

  // Build audit map: id -> { shouldApprove, auditMetadata }
  const auditMap = new Map();
  for (const row of rows) {
    const id = row.id?.trim();
    if (id) {
      auditMap.set(id, {
        shouldApprove: shouldApprove(row),
        auditMetadata: buildAuditMetadata(row),
      });
    }
  }

  console.log(
    `Audit decisions: ${Array.from(auditMap.values()).filter(v => v.shouldApprove).length} approved, ${Array.from(auditMap.values()).filter(v => !v.shouldApprove).length} unapproved`
  );

  // Update JSON snapshot (source of truth)
  const jsonPath = path.join(process.cwd(), 'data/screams-public.json');
  let jsonUpdated = 0;
  let jsonApproved = 0;

  if (fs.existsSync(jsonPath)) {
    console.log('\nUpdating JSON snapshot...');
    const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const jsonMap = new Map(jsonData.map(s => [s.id, s]));

    for (const [id, auditData] of auditMap.entries()) {
      const scream = jsonMap.get(id);
      if (scream) {
        const currentApproved = scream.approved !== false;
        const newApproved = auditData.shouldApprove;
        const hasChanges = currentApproved !== newApproved || !scream.audit;

        if (hasChanges) {
          if (!argv['dry-run']) {
            scream.approved = newApproved;
            scream.audit = auditData.auditMetadata;
          }
          jsonUpdated += 1;
        }
        if (newApproved) {
          jsonApproved += 1;
        }
      }
    }

    if (!argv['dry-run'] && jsonUpdated > 0) {
      // Filter to only approved screams for the public snapshot
      const approvedOnly = jsonData.filter(s => s.approved !== false);
      fs.writeFileSync(jsonPath, JSON.stringify(approvedOnly, null, 2));
      console.log(
        `✓ Updated JSON snapshot: ${jsonUpdated} screams changed, ${approvedOnly.length} approved screams remain`
      );
    } else if (argv['dry-run']) {
      console.log(`[dry-run] Would update ${jsonUpdated} screams in JSON snapshot`);
      console.log(`[dry-run] JSON would contain ${jsonApproved} approved screams after filtering`);
    }
  } else {
    console.warn(`JSON snapshot not found at ${jsonPath}, skipping JSON update`);
  }

  // Update MongoDB (if enabled)
  // Note: We need to sync ALL screams (approved + unapproved) to MongoDB with audit data
  // even though unapproved screams are filtered from JSON
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('\nMONGODB_URI not set. Skipping MongoDB update.');
    console.log('\n✓ Audit results applied to JSON snapshot only.');
    process.exit(0);
  }

  console.log('\nUpdating MongoDB with audit data...');
  console.log(
    'Note: Will sync ALL screams (approved + unapproved) to MongoDB with audit metadata.'
  );
  await mongoose.connect(uri);

  // Load existing JSON to get scream data for upserts
  const existingJsonData = fs.existsSync(jsonPath)
    ? JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    : [];
  const jsonScreamMap = new Map(existingJsonData.map(s => [s.id, s]));

  // Also fetch existing MongoDB docs to preserve any data not in JSON
  const existingMongoDocs = await GoatScream.find({}).lean();
  const mongoScreamMap = new Map(existingMongoDocs.map(d => [d.id, d]));

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let approved = 0;
  let unapproved = 0;
  const missing = [];
  const errors = [];

  console.log(
    argv['dry-run']
      ? '\n[DRY RUN MODE - No changes will be written]\n'
      : '\nApplying audit results...\n'
  );

  for (const [id, auditData] of auditMap.entries()) {
    const { shouldApprove: newApprovedStatus, auditMetadata } = auditData;

    try {
      // Get existing scream data from JSON or MongoDB
      const existingScream = jsonScreamMap.get(id) || mongoScreamMap.get(id);

      if (!existingScream) {
        // Try to reconstruct from CSV row
        const csvRow = rows.find(r => r.id?.trim() === id);
        if (!csvRow) {
          missing.push(id);
          continue;
        }

        // Basic reconstruction from CSV (minimal data)
        const reconstructed = {
          id,
          title: csvRow.title || id,
          source_type: csvRow.source_type || 'viral_video',
          year: csvRow.year ? parseInt(csvRow.year, 10) : undefined,
          audio: {
            duration: csvRow.duration_seconds ? parseFloat(csvRow.duration_seconds) : undefined,
            intensity: csvRow.intensity ? parseInt(csvRow.intensity, 10) : undefined,
          },
          media: {
            audio: {
              mp3: {
                medium: csvRow.audio_url || undefined,
              },
            },
          },
          approved: newApprovedStatus,
          audit: auditMetadata,
        };

        if (argv['dry-run']) {
          console.log(
            `[dry-run] ${id}: Would INSERT (reconstructed from CSV) - ${newApprovedStatus ? 'APPROVED' : 'UNAPPROVED'}`
          );
        } else {
          await GoatScream.create(reconstructed);
          inserted += 1;
        }
        processed += 1;
        if (newApprovedStatus) approved += 1;
        else unapproved += 1;
        continue;
      }

      // Update existing document
      const currentApproved = existingScream.approved !== false;
      const needsUpdate = currentApproved !== newApprovedStatus || !existingScream.audit;

      if (argv['dry-run']) {
        const status = newApprovedStatus ? 'APPROVED' : 'UNAPPROVED';
        const change = needsUpdate
          ? `(change from ${currentApproved ? 'approved' : 'unapproved'})`
          : '(no change)';
        const auditInfo = auditMetadata.bad_not_scream
          ? ' [NOT SCREAM]'
          : auditMetadata.bad_bad_edit
            ? ' [BAD EDIT]'
            : auditMetadata.other_issue
              ? ' [OTHER ISSUE]'
              : '';
        console.log(`[dry-run] ${id}: ${status}${auditInfo} ${change}`);
      } else {
        const update = {
          ...existingScream,
          approved: newApprovedStatus,
          audit: auditMetadata,
        };
        // Remove MongoDB internal fields
        delete update._id;
        delete update.__v;

        const res = await GoatScream.updateOne({ id }, { $set: update }, { upsert: true });
        if (res.upsertedCount > 0) {
          inserted += 1;
        } else {
          updated += 1;
        }
      }

      processed += 1;
      if (newApprovedStatus) {
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
  console.log(`Total processed: ${processed}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated: ${updated}`);
  console.log(`Approved (good): ${approved}`);
  console.log(`Unapproved (not good): ${unapproved}`);
  console.log(`Not found (missing data): ${missing.length}`);

  if (missing.length > 0) {
    console.warn(`\nScreams in audit CSV but not found in MongoDB (${missing.length}):`);
    missing.slice(0, 10).forEach(id => console.warn(`  - ${id}`));
    if (missing.length > 10) {
      console.warn(`  ... and ${missing.length - 10} more`);
    }
  }

  if (errors.length > 0) {
    console.error(`\nErrors encountered (${errors.length}):`);
    errors.forEach(({ id, error }) => console.error(`  - ${id}: ${error}`));
  }

  if (uri) {
    await mongoose.disconnect();
  }

  if (argv['dry-run']) {
    console.log('\n[DRY RUN] No changes were made. Run without --dry-run to apply updates.');
  } else {
    console.log(`\n✓ Updates applied successfully.`);
    if (uri) {
      console.log(
        `✓ MongoDB updated. Run 'pnpm run export:fun' to sync MongoDB → JSON (if needed).`
      );
    }
    console.log(`✓ JSON snapshot updated and filtered to approved screams only.`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
