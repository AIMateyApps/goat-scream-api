require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const GoatScream = require('../src/models/GoatScream');

const argv = yargs(hideBin(process.argv))
  .option('apply', {
    type: 'boolean',
    default: false,
    describe: 'Execute deletions',
  })
  .help().argv;

const PREFIX = 'goat-screams/audio/';

async function listAll() {
  const out = [];
  let cursor;
  do {
    const res = await cloudinary.api.resources({
      type: 'upload',
      resource_type: 'video',
      prefix: PREFIX,
      max_results: 500,
      next_cursor: cursor,
    });
    out.push(
      ...res.resources.map(r => ({
        id: r.public_id,
        bytes: r.bytes,
        duration: r.duration,
        format: r.format,
      }))
    );
    cursor = res.next_cursor;
  } while (cursor);
  return out;
}

async function main() {
  const {
    CLOUDINARY_URL,
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET,
    MONGODB_URI,
  } = process.env;
  if (!MONGODB_URI) {
    console.error('Missing MONGODB_URI');
    process.exit(2);
  }
  if (
    !CLOUDINARY_URL &&
    (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET)
  ) {
    console.error('Missing Cloudinary env');
    process.exit(2);
  }

  cloudinary.config({
    secure: true,
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
  await mongoose.connect(MONGODB_URI);

  const [assets, docs] = await Promise.all([
    listAll(),
    GoatScream.find({}, { id: 1, _id: 0 }).lean(),
  ]);
  const dbIds = new Set(docs.map(d => d.id));

  // group by bytes|duration
  const groups = new Map();
  for (const a of assets) {
    const key = `${a.bytes}|${a.duration || 0}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a.id);
  }

  const genId = pid => pid.startsWith(PREFIX + 'gen-');
  const plan = [];
  for (const [, ids] of groups) {
    if (ids.length <= 1) continue;
    const genOnly = ids.filter(genId);
    if (genOnly.length <= 1) continue; // only prune duplicate generated assets

    // choose keep candidate: prefer one referenced in DB
    let keep = genOnly.find(pid => dbIds.has(pid.slice(PREFIX.length)));
    if (!keep) keep = genOnly[0];
    const toDelete = genOnly.filter(pid => pid !== keep);
    if (toDelete.length > 0) plan.push({ keep, toDelete });
  }

  const totalDeletes = plan.reduce((acc, p) => acc + p.toDelete.length, 0);
  console.log(
    JSON.stringify(
      { duplicateGroups: plan.length, totalDeletes, sample: plan.slice(0, 3) },
      null,
      2
    )
  );

  if (argv.apply) {
    for (const { toDelete } of plan) {
      for (const pid of toDelete) {
        await cloudinary.uploader.destroy(pid, { resource_type: 'video' });

        console.log(`Deleted ${pid}`);
      }
    }
  }

  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
