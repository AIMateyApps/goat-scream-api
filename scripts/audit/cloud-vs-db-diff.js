require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');
const GoatScream = require('../../src/models/GoatScream');

const PREFIX = 'goat-screams/audio/';

async function listAllCloudinaryPublicIds() {
  const ids = [];
  let nextCursor = undefined;
  do {
    const res = await cloudinary.api.resources({
      type: 'upload',
      resource_type: 'video',
      prefix: PREFIX,
      max_results: 500,
      next_cursor: nextCursor,
    });
    res.resources.forEach(r => ids.push(r.public_id));
    nextCursor = res.next_cursor;
  } while (nextCursor);
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

  try {
    const [cloudPublicIds, docs] = await Promise.all([
      listAllCloudinaryPublicIds(),
      GoatScream.find({}, { id: 1, _id: 0 }).lean(),
    ]);

    const cloudIds = cloudPublicIds
      .filter(pid => pid.startsWith(PREFIX))
      .map(pid => pid.slice(PREFIX.length));

    const dbIds = docs.map(d => d.id);

    const cloudSet = new Set(cloudIds);
    const dbSet = new Set(dbIds);

    const onlyInCloudinary = cloudIds.filter(id => !dbSet.has(id));
    const onlyInDb = dbIds.filter(id => !cloudSet.has(id));

    const result = {
      cloudCount: cloudIds.length,
      dbCount: dbIds.length,
      onlyInCloudinaryCount: onlyInCloudinary.length,
      onlyInDbCount: onlyInDb.length,
      sampleOnlyInCloudinary: onlyInCloudinary.slice(0, 15),
      sampleOnlyInDb: onlyInDb.slice(0, 15),
    };

    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(e && e.message ? e.message : e);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
