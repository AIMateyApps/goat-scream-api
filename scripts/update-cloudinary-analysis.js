#!/usr/bin/env node

require('dotenv').config();

const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const { getAsset, updateAssetMetadata } = require('../src/services/cloudinary');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeContext(data) {
  if (!data) return {};
  const ctx = {};
  if (data.descriptor) ctx.analysis_descriptor = data.descriptor;
  if (data.vibe) ctx.analysis_vibe = data.vibe;
  if (data.primary_note) ctx.analysis_primary_note = data.primary_note;
  if (Array.isArray(data.tones_in_order) && data.tones_in_order.length) {
    ctx.analysis_tones = data.tones_in_order.join('|');
  }
  if (data.source_file) ctx.analysis_source = data.source_file;
  return ctx;
}

function combineTags(existing, analysisTags) {
  const set = new Set();
  (existing || []).forEach(tag => {
    if (tag) set.add(String(tag));
  });
  (analysisTags || []).forEach(tag => {
    if (tag) set.add(String(tag));
  });
  return Array.from(set);
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('map', {
      type: 'string',
      describe: 'Path to analysis map JSON (id -> analysis)',
      default: path.resolve(process.cwd(), 'data/analysis-map.json'),
    })
    .option('dry-run', {
      type: 'boolean',
      default: false,
      describe: 'Print intended Cloudinary updates without applying them',
    })
    .option('limit', {
      type: 'number',
      describe: 'Limit number of assets to update',
    })
    .option('resume-id', {
      type: 'string',
      describe: 'Resume updates starting from this asset id (inclusive)',
    })
    .option('delay', {
      type: 'number',
      default: 300,
      describe: 'Delay in milliseconds between Cloudinary API calls',
    })
    .help()
    .alias('h', 'help').argv;

  const map = require(argv.map);
  let ids = Object.keys(map);

  if (argv['resume-id']) {
    const resumeId = String(argv['resume-id']);
    const startIndex = ids.indexOf(resumeId);
    if (startIndex === -1) {
      console.warn(`resume-id ${resumeId} not found in analysis map; processing entire set.`);
    } else {
      ids = ids.slice(startIndex);
      console.log(
        `Resuming Cloudinary updates from ${resumeId} (index ${startIndex}). Remaining ids: ${ids.length}`
      );
    }
  }

  const limit = argv.limit && argv.limit > 0 ? Math.min(argv.limit, ids.length) : ids.length;

  let processed = 0;
  const missing = [];
  const updated = [];
  const failures = [];
  let rateLimited = null;

  for (let idx = 0; idx < limit; idx += 1) {
    const id = ids[idx];
    const data = map[id];
    const publicId = `goat-screams/audio/${id}`;

    let asset = null;
    try {
      asset = await getAsset(publicId);
    } catch (err) {
      const httpCode = err && err.error && err.error.http_code;
      if (httpCode === 420) {
        rateLimited = {
          id,
          message: err.error.message,
          processed,
        };
        console.warn(
          `Cloudinary rate limit reached while fetching asset after ${processed} updates. Resume with --resume-id ${id}`
        );
        break;
      }

      const message =
        err && err.error && err.error.message
          ? err.error.message
          : err && err.message
            ? err.message
            : String(err);
      failures.push({
        id,
        message,
        httpCode,
      });
      processed += 1;
      continue;
    }

    if (!asset) {
      missing.push(id);
      processed += 1;
      continue;
    }

    const context = normalizeContext(data);
    const tags = combineTags(asset.tags, data.tags);

    if (argv.dryRun) {
      console.log(
        JSON.stringify(
          {
            id,
            public_id: publicId,
            context,
            tags,
          },
          null,
          2
        )
      );
    } else {
      try {
        await updateAssetMetadata(publicId, { context, tags });
        updated.push(id);
      } catch (err) {
        const httpCode = err && err.error && err.error.http_code;
        if (httpCode === 420) {
          rateLimited = {
            id,
            message: err.error.message,
            processed,
          };
          console.warn(
            `Cloudinary rate limit reached after ${processed} updates. Resume with --resume-id ${id}`
          );
          break;
        }

        const message =
          err && err.error && err.error.message
            ? err.error.message
            : err && err.message
              ? err.message
              : String(err);
        failures.push({
          id,
          message,
          httpCode,
        });
        continue;
      }

      if (argv.delay) {
        await sleep(argv.delay);
      }
    }

    processed += 1;
  }

  const summary = {
    mapped: ids.length,
    processed,
    updated: updated.length,
    missing: missing.length,
    failures: failures.length,
    dryRun: argv.dryRun,
  };

  if (rateLimited) {
    summary.rateLimited = rateLimited;
  }

  console.log(JSON.stringify(summary, null, 2));
  if (missing.length) {
    console.log(`Missing Cloudinary assets for ${missing.length} ids.`);
  }
  if (failures.length) {
    console.warn(`Failed to update ${failures.length} assets.`);
    const sampleFailures = failures.slice(0, 5);
    sampleFailures.forEach(failure => {
      console.warn(` - ${failure.id}: ${failure.message} (${failure.httpCode || 'no-code'})`);
    });
  }
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
