#!/usr/bin/env node
// Merge curated CSVs into a single data/curated-screams.csv, de-duplicating by id.
// Usage:
//   node scripts/merge-curation.js --into data/curated-screams.csv data/curated-ai.csv [more.csv ...]

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

function parseArgs() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--into');
  if (outIdx === -1 || !args[outIdx + 1]) {
    console.error(
      'Usage: node scripts/merge-curation.js --into <target.csv> <src1.csv> [src2.csv ...]'
    );
    process.exit(1);
  }
  const target = args[outIdx + 1];
  const sources = args.slice(outIdx + 2).filter(a => !a.startsWith('--'));
  if (sources.length === 0) {
    console.error('Provide at least one source CSV after the --into <target.csv> argument');
    process.exit(1);
  }
  return { target, sources };
}

function readCsv(file) {
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return [];
  return parse(raw, { columns: true, skip_empty_lines: true, trim: true });
}

function writeCsv(file, rows, headers) {
  const folder = path.dirname(file);
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  const lines = [headers.join(',')];
  for (const row of rows) {
    const line = headers
      .map(h => {
        const v = row[h] == null ? '' : String(row[h]);
        return v.includes(',') ? `"${v.replace(/"/g, '""')}"` : v;
      })
      .join(',');
    lines.push(line);
  }
  fs.writeFileSync(file, lines.join('\n'));
}

function mergeRows(existing, incoming) {
  const byId = new Map();
  const headers = new Set();
  const add = row => {
    if (!row || !row.id) return;
    // Normalize booleans to strings for consistency (CSV strings)
    if (typeof row.approved === 'boolean') row.approved = row.approved ? 'true' : 'false';
    Object.keys(row).forEach(k => headers.add(k));
    byId.set(row.id, row);
  };
  existing.forEach(add);
  incoming.forEach(add);
  const rows = Array.from(byId.values());
  const headerOrder = [
    'id',
    'title',
    'source_type',
    'year',
    'intensity',
    'tags',
    'meme_status',
    'license_type',
    'license_url',
    'attribution_required',
    'attribution_text',
    'notes',
    'approved',
  ];
  // Union headers but keep preferred order first
  const finalHeaders = [
    ...headerOrder,
    ...Array.from(headers).filter(h => !headerOrder.includes(h)),
  ];
  return { rows, headers: finalHeaders };
}

function backup(file) {
  if (!fs.existsSync(file)) return;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const bak = `${file}.${ts}.bak`;
  fs.copyFileSync(file, bak);
  console.log('Backed up', file, '->', bak);
}

function main() {
  const { target, sources } = parseArgs();
  const current = readCsv(target);
  const allIncoming = sources.flatMap(src => readCsv(src));
  const { rows, headers } = mergeRows(current, allIncoming);
  backup(target);
  writeCsv(target, rows, headers);
  console.log(`Merged ${sources.length} source(s) into ${target}. Rows now: ${rows.length}`);
}

main();
