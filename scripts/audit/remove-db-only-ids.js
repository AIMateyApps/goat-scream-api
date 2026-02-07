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

async function listAllCloudIds() {
  const ids = [];
  let cursor;
  do {
    const res = await cloudinary.api.resources({
      type: 'upload',
      resource_type: 'video',
      prefix: PREFIX,
      max_results: 500,
      next_cursor: cursor,
    });
    res.resources.forEach(r => ids.push(r.public_id.slice(PREFIX.length)));
    cursor = res.next_cursor;
  } while (cursor);
  return ids;
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

  const [cloudIds, docs] = await Promise.all([
    listAllCloudIds(),
    GoatScream.find({}, { id: 1, _id: 0 }).lean(),
  ]);
  const cloudSet = new Set(cloudIds);
  const dbIds = docs.map(d => d.id);
  const onlyInDb = dbIds.filter(id => !cloudSet.has(id));

  console.log(
    JSON.stringify(
      {
        dbCount: dbIds.length,
        cloudCount: cloudIds.length,
        onlyInDbCount: onlyInDb.length,
        sample: onlyInDb.slice(0, 20),
      },
      null,
      2
    )
  );

  if (argv.apply && onlyInDb.length > 0) {
    const res = await GoatScream.deleteMany({ id: { $in: onlyInDb } });

    console.log(`Deleted ${res.deletedCount} DB docs not present in Cloudinary`);
  }

  await mongoose.disconnect();
}

main().catch(e => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
