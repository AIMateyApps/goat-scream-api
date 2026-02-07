#!/usr/bin/env node

require('dotenv').config();
const mongoose = require('mongoose');
const GoatScream = require('../src/models/GoatScream');

const REQUIRED_PATHS = [
  'id',
  'title',
  'source_type',
  'year',
  'audio.duration',
  'audio.intensity',
  'media.audio.mp3.medium',
  'meme_status',
  'tags',
  'approved',
  'license.type',
];

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  await mongoose.connect(uri);

  const docs = await GoatScream.find().lean();
  console.log(`Total screams: ${docs.length}`);

  const errors = [];
  const cloudinaryMap = new Map();
  let approvedCount = 0;

  docs.forEach(doc => {
    if (doc.approved) approvedCount += 1;

    const requiredPaths = doc.approved
      ? REQUIRED_PATHS
      : REQUIRED_PATHS.filter(path => !path.startsWith('license.'));

    const missing = requiredPaths.filter(path => {
      const value = getPath(doc, path);
      if (path === 'tags') {
        return !Array.isArray(value) || value.length === 0;
      }
      if (path === 'license.type') {
        return value === undefined || value === null || value === '' || value === 'unknown';
      }
      return value === undefined || value === null || value === '';
    });

    const mediaUrl = getPath(doc, 'media.audio.mp3.medium');
    if (mediaUrl) {
      if (!cloudinaryMap.has(mediaUrl)) {
        cloudinaryMap.set(mediaUrl, []);
      }
      cloudinaryMap.get(mediaUrl).push(doc.id);
    }

    if (missing.length > 0) {
      errors.push({ id: doc.id, missing });
    }
  });

  const duplicates = Array.from(cloudinaryMap.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([url, ids]) => ({ url, ids }));

  console.log(`Approved screams: ${approvedCount}`);
  console.log(`Records missing fields: ${errors.length}`);
  if (errors.length > 0) {
    errors.slice(0, 10).forEach(err => {
      console.log(` - ${err.id}: missing ${err.missing.join(', ')}`);
    });
    if (errors.length > 10) {
      console.log(` ... ${errors.length - 10} more`);
    }
  }

  console.log(`Duplicate media URLs: ${duplicates.length}`);
  if (duplicates.length > 0) {
    duplicates.forEach(dup => {
      console.log(` - ${dup.url}: ${dup.ids.join(', ')}`);
    });
  }

  await mongoose.disconnect();

  if (errors.length > 0 || duplicates.length > 0) {
    console.error('Audit failed');
    process.exit(1);
  }

  console.log('Audit passed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
