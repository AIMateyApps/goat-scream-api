#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const GoatScream = require('../src/models/GoatScream');

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }
  await mongoose.connect(uri);

  const issues = await GoatScream.find({
    approved: true,
    $or: [
      { 'license.type': { $in: [null, '', 'unknown'] } },
      { 'license.url': { $in: [null, ''] } },
      { last_curated_at: { $exists: false } },
    ],
  })
    .select('id title license last_curated_at')
    .lean();

  const report = {
    generated_at: new Date().toISOString(),
    total_issues: issues.length,
    items: issues.map(doc => ({
      id: doc.id,
      title: doc.title,
      license_type: doc.license?.type || null,
      license_url: doc.license?.url || null,
      last_curated_at: doc.last_curated_at || null,
    })),
  };

  const outDir = path.join(process.cwd(), 'audit', 'logs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, `license-audit-${report.generated_at.slice(0, 10)}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  console.log(`License audit complete. Issues found: ${report.total_issues}. Report: ${filePath}`);

  await mongoose.disconnect();
})();
