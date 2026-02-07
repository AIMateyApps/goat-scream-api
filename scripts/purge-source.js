#!/usr/bin/env node

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const mongoose = require('mongoose');
const GoatScream = require('../src/models/GoatScream');

const cloudinary = require('cloudinary').v2;
const { deleteAsset } = require('../src/services/cloudinary');

function extractCloudinaryPublicIdsFromDoc(doc) {
  const publicIds = new Set();
  const audio = doc?.media?.audio || {};
  const urls = [];
  Object.values(audio).forEach(qualities => {
    Object.values(qualities || {}).forEach(u => {
      if (typeof u === 'string') urls.push(u);
    });
  });
  const regex = /\/upload\/(?:[^/]+\/)*v\d+\/([^.?]+)(?:\.[a-z0-9]+)?$/i;
  urls.forEach(u => {
    const m = u.match(regex);
    if (m && m[1]) publicIds.add(m[1]);
  });
  return Array.from(publicIds);
}

async function maybeConnectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return false;
  try {
    await mongoose.connect(uri);
    return true;
  } catch (err) {
    console.warn(`Mongo connect failed: ${err.message}`);
    return false;
  }
}

async function purgeFromMongo(title, pattern) {
  const connected = await maybeConnectMongo();
  if (!connected) return { deleted: 0, docs: [] };
  const filter = pattern
    ? { 'source.title': { $regex: pattern, $options: 'i' } }
    : { 'source.title': title };
  const docs = await GoatScream.find(filter).lean();
  if (!docs.length) return { deleted: 0, docs: [] };
  const res = await GoatScream.deleteMany(filter);
  return { deleted: res?.deletedCount || 0, docs };
}

function purgeFromJson(title, { apply, pattern }) {
  const file = path.resolve(__dirname, '../data/screams-public.json');
  if (!fs.existsSync(file)) return { removed: 0 };
  const arr = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const keep = arr.filter(s => {
    const t = s?.source?.title || '';
    if (pattern) return !new RegExp(pattern, 'i').test(t);
    return t !== title;
  });
  const removed = arr.length - keep.length;
  if (apply && removed > 0) {
    fs.writeFileSync(file, JSON.stringify(keep, null, 2));
  }
  return { removed };
}

function purgeFromCsv(title, { apply, pattern }) {
  const csv = path.resolve(__dirname, '../data/curated-screams.csv');
  if (!fs.existsSync(csv)) return { removed: 0 };
  const lines = fs.readFileSync(csv, 'utf-8').split('\n');
  const keep = lines.filter(line => {
    if (pattern) return !new RegExp(pattern, 'i').test(line);
    return !line.includes(title);
  });
  const removed = lines.length - keep.length;
  if (apply && removed > 0) {
    fs.writeFileSync(csv, keep.join('\n'));
  }
  return { removed };
}

async function purgeFromCloudinary(publicIds, { apply, expression }) {
  let attempted = 0;
  let deleted = 0;
  if (publicIds.length) {
    for (const pid of publicIds) {
      try {
        if (apply) await deleteAsset(pid);
        deleted += 1;
      } catch (err) {
        console.warn(`Cloudinary delete failed for ${pid}: ${err.message}`);
      }
      attempted += 1;
    }
  }
  if (expression) {
    try {
      const res = await cloudinary.search.expression(expression).max_results(500).execute();
      const hits = res?.resources || [];
      for (const r of hits) {
        try {
          if (apply) await deleteAsset(r.public_id);
          deleted += 1;
        } catch (err) {
          console.warn(`Cloudinary delete failed for ${r.public_id}: ${err.message}`);
        }
      }
      attempted += hits.length;
    } catch (err) {
      console.warn(`Cloudinary search failed: ${err.message}`);
    }
  }
  return { attempted, deleted };
}

function configureCloudinaryIfNeeded() {
  const cfg = cloudinary.config();
  if (!cfg || !cfg.cloud_name) {
    const { CLOUDINARY_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
      process.env;
    if (CLOUDINARY_URL || (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET)) {
      cloudinary.config({
        secure: true,
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
      });
    }
  }
}

async function purgeFromCloudinaryByPrefix(prefix, { apply }) {
  if (!prefix) return { attempted: 0, deleted: 0 };
  try {
    configureCloudinaryIfNeeded();
    if (apply) {
      const res = await cloudinary.api.delete_resources_by_prefix(prefix, {
        resource_type: 'video',
      });
      const count = Object.values(res.deleted || {}).filter(v => v === 'deleted').length;
      return { attempted: count, deleted: count };
    }
    // dry-run
    const res = await cloudinary.search
      .expression(`public_id:${prefix}*`)
      .max_results(500)
      .execute();
    const hits = res?.resources?.length || 0;
    return { attempted: hits, deleted: 0 };
  } catch (err) {
    console.warn(`Cloudinary prefix purge failed (${prefix}): ${err.message || err}`);
    return { attempted: 0, deleted: 0 };
  }
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('title', { type: 'string', demandOption: true, desc: 'Exact source.title to purge' })
    .option('pattern', {
      type: 'string',
      desc: 'Substring/regex to match in source.title (overrides exact title)',
    })
    .option('cloudPrefix', {
      type: 'string',
      desc: 'Cloudinary public_id prefix to delete (e.g., goat-screams/audio/ytb-...-)',
    })
    .option('apply', { type: 'boolean', default: false, desc: 'Apply destructive changes' })
    .help().argv;

  const title = argv.title;
  const pattern = argv.pattern;
  const cloudPrefix = argv.cloudPrefix;
  const apply = argv.apply;

  console.log(
    `Purging items where source.title ${pattern ? `~ /${pattern}/i` : `== ${JSON.stringify(title)}`} (${apply ? 'APPLY' : 'DRY-RUN'})`
  );

  // Mongo first (to collect canonical docs and public IDs)
  const mongo = await purgeFromMongo(title, pattern);
  const mongoPublicIds = mongo.docs.flatMap(extractCloudinaryPublicIdsFromDoc);

  // Fallback to JSON for public IDs if Mongo was not available
  let jsonPublicIds = [];
  if (!mongo.docs.length) {
    try {
      const jsonPath = path.resolve(__dirname, '../data/screams-public.json');
      if (fs.existsSync(jsonPath)) {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const matches = data.filter(s => {
          const t = s?.source?.title || '';
          if (pattern) return new RegExp(pattern, 'i').test(t);
          return t === title;
        });
        jsonPublicIds = matches.flatMap(extractCloudinaryPublicIdsFromDoc);
      }
    } catch (err) {
      console.warn(`Failed to scan JSON for public IDs: ${err.message}`);
    }
  }

  const publicIds = Array.from(new Set([...mongoPublicIds, ...jsonPublicIds]));

  // Cloudinary
  const expression = pattern ? `context.title:*${pattern}* OR public_id:*${pattern}*` : null;
  const cloud = await purgeFromCloudinary(publicIds, { apply, expression });
  const cloudPrefixResult = await purgeFromCloudinaryByPrefix(cloudPrefix, { apply });

  // Files
  const json = purgeFromJson(title, { apply, pattern });
  const csv = purgeFromCsv(title, { apply, pattern });

  console.log(
    JSON.stringify({ mongo, cloud, cloud_prefix: cloudPrefixResult, json, csv }, null, 2)
  );

  if (apply) {
    try {
      await mongoose.disconnect();
    } catch {
      /* ignore disconnect errors */
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
