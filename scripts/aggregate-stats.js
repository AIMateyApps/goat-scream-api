#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const GoatScream = require('../src/models/GoatScream');
const Submission = require('../src/models/Submission');

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri);

  const [approved, totalSubmissions, pendingSubmissions, topDownloads, topDailyHits] =
    await Promise.all([
      GoatScream.countDocuments({ approved: true }),
      Submission.estimatedDocumentCount(),
      Submission.countDocuments({ status: 'pending_review' }),
      GoatScream.find({ approved: true }).sort({ 'stats.downloads': -1 }).limit(10).lean(),
      GoatScream.find({ approved: true }).sort({ 'stats.daily_hits': -1 }).limit(10).lean(),
    ]);

  const snapshot = {
    generated_at: new Date().toISOString(),
    approved_screams: approved,
    submissions: {
      total: totalSubmissions,
      pending: pendingSubmissions,
    },
    top_downloads: topDownloads.map(doc => ({
      id: doc.id,
      title: doc.title,
      downloads: doc.stats?.downloads || 0,
    })),
    top_daily_hits: topDailyHits.map(doc => ({
      id: doc.id,
      title: doc.title,
      daily_hits: doc.stats?.daily_hits || 0,
    })),
  };

  const statsDir = path.join(process.cwd(), 'stats');
  if (!fs.existsSync(statsDir)) fs.mkdirSync(statsDir, { recursive: true });
  const filePath = path.join(statsDir, `daily-${snapshot.generated_at.slice(0, 10)}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
  console.log('Saved stats snapshot to', filePath);

  await mongoose.disconnect();
})();
