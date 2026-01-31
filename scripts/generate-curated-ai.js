#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const fg = require('fast-glob');
const { parseFile } = require('music-metadata');

const GENERATED_DIR = path.join(process.cwd(), 'screams/Generated');
const OUT_PATH = path.join(process.cwd(), 'data/curated-ai.csv');

function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function detectGenerator(basename) {
  const lower = basename.toLowerCase();
  if (lower.startsWith('11labs_') || lower.startsWith('elevenlabs_')) return 'elevenlabs';
  if (lower.startsWith('sora2_') || lower.startsWith('sora_')) return 'sora2';
  return 'unknown';
}

function licenseForGenerator(gen) {
  if (gen === 'elevenlabs')
    return { url: 'https://elevenlabs.io/terms', text: 'AI-generated with ElevenLabs' };
  if (gen === 'sora2')
    return { url: 'https://openai.com/policies/terms', text: 'AI-generated with Sora2' };
  return { url: '', text: 'AI-generated' };
}

function inferIntensity(words) {
  const s = words.join(' ').toLowerCase();
  if (/alarm|piercing|scream|yell|sharp|loud/.test(s)) return 8;
  if (/distant|soft|gentle|far|calm/.test(s)) return 5;
  return 6;
}

function inferTags(gen, words, duration) {
  const len =
    duration == null ? 'unknown' : duration < 2.5 ? 'short' : duration < 5 ? 'medium' : 'long';
  const pitch = /high/.test(words.join(' ').toLowerCase())
    ? 'high'
    : /low/.test(words.join(' ').toLowerCase())
      ? 'low'
      : 'mid';
  const base = ['ai_generated', `generator:${gen}`, `pitch:${pitch}`, `length:${len}`];
  const promptTokens = words
    .slice(0, 3)
    .map(w => `prompt:${slugify(w)}`)
    .filter(Boolean);
  return base.concat(promptTokens);
}

function inferTitle(gen, words) {
  const niceGen = gen === 'elevenlabs' ? 'ElevenLabs' : gen === 'sora2' ? 'Sora2' : 'AI';
  const desc = words.slice(0, 3).join(' ').replace(/[-_]+/g, ' ');
  return `${niceGen} — ${desc || 'Goat Bleat'}`;
}

function inferPromptParts(basename) {
  // Strip generator prefix and trailing timestamp/hash
  const name = basename.replace(/\.(mp3|wav)$/i, '');
  const afterPrefix = name.replace(/^(11labs_|elevenlabs_|sora2_|sora_)/i, '');
  // Remove trailing -<digits> or _#<num>-<digits>
  const core = afterPrefix.replace(/[-_](#\d+)?-\d+$/, '');
  // Split to words
  const words = core.split(/[-_\s]+/).filter(Boolean);
  return words;
}

async function main() {
  if (!fs.existsSync(GENERATED_DIR)) {
    console.error('Directory not found:', GENERATED_DIR);
    process.exit(1);
  }
  const files = await fg(['**/*.mp3'], { cwd: GENERATED_DIR, absolute: true });
  if (!files.length) {
    console.error('No mp3 files found under', GENERATED_DIR);
    process.exit(1);
  }

  const year = new Date().getFullYear();
  const rows = [];
  for (const file of files) {
    const base = path.basename(file);
    const gen = detectGenerator(base);
    const words = inferPromptParts(base);
    let duration = null;
    try {
      const meta = await parseFile(file);
      duration = meta.format.duration ? Number(meta.format.duration.toFixed(2)) : null;
    } catch {
      // Ignore metadata parse failures - duration stays null
    }
    const intensity = inferIntensity(words);
    const tags = inferTags(gen, words, duration).join('|');
    const title = inferTitle(gen, words);
    const slug = slugify(words.slice(0, 3).join('-')) || 'bleat';
    const crypto = require('crypto');
    const short = crypto.createHash('md5').update(base).digest('hex').slice(0, 2);
    const id = `gen-${gen}-${slug}-${short}`;
    const license = licenseForGenerator(gen);
    rows.push({
      id,
      title,
      source_type: 'ai_generated',
      year,
      intensity,
      tags,
      meme_status: 'emerging',
      license_type: 'generated_ai',
      license_url: license.url,
      attribution_required: 'false',
      attribution_text: license.text,
      notes: `AI-generated from filename ${base}`,
      approved: 'true',
    });
  }

  const headers = [
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
    'filename',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    const csvLine = headers
      .map(h => {
        const v =
          h === 'filename'
            ? path.basename(row.notes?.replace(/^.*filename\s+/i, '') || '')
            : (row[h] ?? '');
        const s = String(v);
        return s.includes(',') ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(',');
    lines.push(csvLine);
  }

  await fsp.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fsp.writeFile(OUT_PATH, lines.join('\n'));
  console.log('Wrote curated AI CSV:', OUT_PATH, 'rows:', rows.length);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
