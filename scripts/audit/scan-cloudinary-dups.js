require('dotenv').config();
const cloudinary = require('cloudinary').v2;

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
  const { CLOUDINARY_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env;
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

  const assets = await listAll();
  const groups = new Map();
  for (const a of assets) {
    const key = `${a.bytes}|${a.duration || 0}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a.id);
  }

  const dups = Array.from(groups.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([k, ids]) => ({ key: k, count: ids.length, ids }));

  console.log(
    JSON.stringify(
      {
        total: assets.length,
        duplicateGroups: dups.length,
        samples: dups.slice(0, 5),
      },
      null,
      2
    )
  );
}

main().catch(e => {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
