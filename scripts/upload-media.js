#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const fg = require('fast-glob');
const { parseFile } = require('music-metadata');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { parse } = require('csv-parse/sync');

const { connectMongo } = require('../src/db/connection');
const GoatScream = require('../src/models/GoatScream');
const { uploadAudio, getAsset } = require('../src/services/cloudinary');

const argv = yargs(hideBin(process.argv))
  .option('dir', {
    type: 'string',
    default: path.join(process.cwd(), 'screams/output'),
    describe: 'Directory containing processed clips',
  })
  .option('index', {
    type: 'string',
    describe: 'Path to index.json describing clips',
  })
  .option('glob', {
    type: 'string',
    default: '**/*.mp3',
    describe: 'Glob pattern (relative to dir) to discover clips',
  })
  .option('limit', {
    type: 'number',
    describe: 'Limit number of clips processed (for testing)',
  })
  .option('dry-run', {
    type: 'boolean',
    default: false,
    describe: 'Print actions without uploading or writing to Mongo',
  })
  .option('tag', {
    type: 'array',
    describe: 'Additional Cloudinary tags to append',
  })
  .option('approve', {
    type: 'boolean',
    default: false,
    describe: 'Mark ingested clips as approved',
  })
  .option('source-type', {
    type: 'string',
    default: 'viral_video',
    describe: 'Source type applied to ingested clips',
  })
  .option('meme-status', {
    type: 'string',
    default: 'emerging',
    describe: 'Default meme_status to apply',
  })
  .option('skip-upload', {
    type: 'boolean',
    default: false,
    describe: 'Skip Cloudinary upload (assumes public_id already exists)',
  })
  .option('from-curation', {
    type: 'string',
    describe: 'Optional curated metadata CSV to merge during upload',
  })
  .option('noindex', {
    type: 'boolean',
    default: false,
    describe: 'Process files without index.json (derive minimal metadata)',
  })
  .help()
  .alias('h', 'help').argv;

const OUTPUT_ROOT = argv.dir;
const INDEX_PATH = argv.index || path.join(OUTPUT_ROOT, 'index.json');
const ORIGINALS_DIR = path.join(process.cwd(), 'screams/Originals');
const CLOUDINARY_PREFIX = 'goat-screams/audio';

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function extractVideoId(str) {
  const match = str.match(/\[([^\]]+)\]/);
  return match ? match[1] : null;
}

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const totalMs = Math.round(seconds * 1000);
  const s = Math.floor((totalMs / 1000) % 60);
  const m = Math.floor((totalMs / (60 * 1000)) % 60);
  const h = Math.floor(totalMs / (60 * 60 * 1000));
  const frac = totalMs % 1000;
  const base = [h, m, s].map(unit => unit.toString().padStart(2, '0')).join(':');
  return frac ? `${base}.${frac.toString().padStart(3, '0')}` : base;
}

function confidenceToIntensity(conf) {
  if (!Number.isFinite(conf)) return 5;
  const scaled = Math.round(conf * 10);
  return Math.max(1, Math.min(10, scaled || 1));
}

function durationToCategory(duration) {
  if (!Number.isFinite(duration)) return 'short_burst';
  if (duration <= 2.5) return 'short_burst';
  if (duration <= 5) return 'multiple';
  return 'prolonged';
}

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'y'].includes(v);
  }
  return false;
}

function parseTagsValue(value, fallback = []) {
  if (!value) return [...fallback];
  if (Array.isArray(value)) return value;
  return value
    .split(/[,|]/)
    .map(token => token.trim())
    .filter(Boolean);
}

function normalizeDash(value) {
  if (value == null) return null;
  const cleaned = String(value)
    .trim()
    .replace(/\u2014/g, '-');
  if (!cleaned || cleaned === '-' || cleaned.toLowerCase() === 'none') return null;
  return cleaned;
}

function parseToneSequence(value) {
  if (!value) return [];
  return String(value)
    .split(/[|;]+/)
    .map(token => token.trim().replace(/\u2014/g, '-'))
    .filter(token => token && token !== '-');
}

function parseAnalysisTags(value) {
  if (!value) return [];
  return String(value)
    .split(/[,|]+/)
    .map(token => token.trim().replace(/\u2014/g, '-'))
    .filter(Boolean);
}

async function readJson(filePath) {
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data);
}

async function main() {
  const noIndex = argv.noindex || argv.noIndex;
  const indexExists = await fs
    .access(INDEX_PATH)
    .then(() => true)
    .catch(() => false);

  let indexData = { files: {} };
  if (indexExists) {
    indexData = await readJson(INDEX_PATH);
  } else if (!noIndex) {
    console.error(`Index file not found: ${INDEX_PATH}`);
    process.exit(1);
  }
  const clipMap = new Map();

  for (const [sourcePath, clips] of Object.entries(indexData.files || {})) {
    clips.forEach((clip, idx) => {
      const basename = path.basename(clip.output_file);
      clipMap.set(basename, {
        clip,
        clipNumber: idx + 1,
        sourcePath,
      });
    });
  }

  let files = await fg(argv.glob, { cwd: OUTPUT_ROOT, absolute: true });
  files = files.sort();
  if (argv.limit) {
    files = files.slice(0, argv.limit);
  }

  console.log(`Discovered ${files.length} clip(s)`);

  let mongoReady = false;
  if (!argv['dry-run']) {
    const dbStatus = await connectMongo();
    if (!dbStatus.connected) {
      console.error(`Mongo connection failed: ${dbStatus.error}`);
      process.exit(1);
    }
    mongoReady = true;
  }

  const baseTags = ['goat', 'scream', 'clip'];
  if (argv.tag) {
    argv.tag.forEach(t => {
      if (typeof t === 'string') baseTags.push(t);
    });
  }

  let curationMap = null;
  let curationByFilename = null;
  if (argv['from-curation']) {
    try {
      const csvRaw = await fs.readFile(argv['from-curation'], 'utf8');
      const rows = parse(csvRaw, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
      curationMap = new Map();
      curationByFilename = new Map();
      rows.forEach(row => {
        if (row.id) curationMap.set(row.id, row);
        const fn = (row.filename || '').trim();
        if (fn) curationByFilename.set(fn, row);
      });
      console.log(
        `Loaded curated metadata for ${curationMap.size} ids from ${argv['from-curation']}`
      );
    } catch (err) {
      console.warn('Failed to load curation CSV:', err.message);
    }
  }

  const infoCache = new Map();
  let processed = 0;
  let skipped = 0;

  for (const filePath of files) {
    const filename = path.basename(filePath);
    let entry = clipMap.get(filename);
    if (!entry) {
      if (noIndex) {
        entry = { clip: {}, clipNumber: 1, sourcePath: filePath };
      } else {
        console.warn(`Skipping ${filename} — not found in index`);
        skipped += 1;
        continue;
      }
    }

    const { clip, clipNumber } = entry;
    const parentDir = path.basename(path.dirname(filePath));
    const videoId = extractVideoId(parentDir);
    // Derive clip label. When running with --noindex, try to parse from filename pattern "_clip_###" to preserve IDs.
    let clipLabel = clipNumber.toString().padStart(3, '0');
    if (noIndex && typeof filename === 'string') {
      const match = filename.match(/_clip_(\d{1,3})/);
      if (match && match[1]) {
        clipLabel = match[1].toString().padStart(3, '0');
      }
    }
    const slug = slugify(parentDir);
    let id = videoId ? `ytb-${videoId}-c${clipLabel}` : `clip-${slug}-${clipLabel}`;

    const infoPathCandidates = [
      path.join(ORIGINALS_DIR, `${parentDir}.info.json`),
      path.join(ORIGINALS_DIR, `${parentDir}.json`),
    ];

    let info = null;
    if (infoCache.has(parentDir)) {
      info = infoCache.get(parentDir);
    } else {
      for (const candidate of infoPathCandidates) {
        const exists = await fs
          .access(candidate)
          .then(() => true)
          .catch(() => false);
        if (exists) {
          info = await readJson(candidate);
          infoCache.set(parentDir, info);
          break;
        }
      }
    }

    if (!info && noIndex) {
      info = {
        title: null,
        extractor_key: 'AI',
        webpage_url: null,
        uploader: 'AI Generated',
        channel: 'AI Generated',
        channel_url: null,
      };
    }
    if (!info) {
      console.warn(`Missing .info.json metadata for ${parentDir}; skipping`);
      skipped += 1;
      continue;
    }

    const uploadDate = info.upload_date;
    const year = uploadDate ? Number(String(uploadDate).slice(0, 4)) : null;
    let title = info.title ? `${info.title} (clip ${clipLabel})` : `Goat scream clip ${clipLabel}`;
    const context = `Clip ${clipLabel} from ${info.title || 'unknown source'}`;

    let duration = null;
    try {
      const meta = await parseFile(filePath);
      duration = meta.format.duration ? Number(meta.format.duration.toFixed(2)) : null;
    } catch {
      duration = null;
    }

    if (!duration && Number.isFinite(clip.end_s) && Number.isFinite(clip.start_s)) {
      duration = Number(
        (clip.end_s - clip.start_s + (clip.pad_head_s || 0) + (clip.pad_tail_s || 0)).toFixed(2)
      );
    }

    const intensity = confidenceToIntensity(clip.mean_confidence);
    const category = durationToCategory(duration);
    const timestamp = formatSeconds(clip.start_s);
    let uploadResult = null;

    let curated = curationMap ? curationMap.get(id) : null;
    if (!curated && noIndex && curationByFilename) {
      curated = curationByFilename.get(filename) || curationByFilename.get(path.basename(filePath));
    }
    const curatedTags = curated ? parseTagsValue(curated.tags, baseTags) : [...baseTags];
    const analysisTags = curated
      ? parseAnalysisTags(curated.analysis_tags || curated.analysisTags)
      : [];
    const combinedTags = Array.from(new Set([...curatedTags, ...analysisTags]));
    const curatedIntensity = curated && curated.intensity ? Number(curated.intensity) : null;
    const curatedMemeStatus = curated?.meme_status || argv['meme-status'];
    const curatedApproved = curated ? parseBool(curated.approved) : Boolean(argv.approve);
    const curatedLicense = curated
      ? {
          type: curated.license_type || 'unknown',
          url: curated.license_url || undefined,
          attribution_required: parseBool(curated.attribution_required),
          attribution_text: curated.attribution_text || undefined,
          notes: curated.notes || undefined,
        }
      : null;

    if (curated && curated.id) id = curated.id;
    if (curated && curated.title) title = curated.title;

    const curatedAnalysis = curated
      ? {
          descriptor: normalizeDash(curated.analysis_descriptor || curated.analysisDescriptor),
          vibe: normalizeDash(curated.analysis_vibe || curated.analysisVibe),
          tags: analysisTags,
          primary_note: normalizeDash(curated.analysis_primary_note || curated.analysisPrimaryNote),
          tones_in_order: parseToneSequence(curated.analysis_tones || curated.analysisTones),
        }
      : null;

    const publicId = `${CLOUDINARY_PREFIX}/${id}`;

    const cloudContext = {
      source_url: info.webpage_url,
      source_title: info.title,
      video_id: videoId,
    };

    if (curatedAnalysis) {
      if (curatedAnalysis.descriptor) cloudContext.analysis_descriptor = curatedAnalysis.descriptor;
      if (curatedAnalysis.vibe) cloudContext.analysis_vibe = curatedAnalysis.vibe;
      if (curatedAnalysis.primary_note)
        cloudContext.analysis_primary_note = curatedAnalysis.primary_note;
      const toneSequence = curatedAnalysis.tones_in_order || [];
      if (toneSequence.length) cloudContext.analysis_tones = toneSequence.join('|');
    }

    if (argv['dry-run'] || argv['skip-upload']) {
      console.log(`[dry-run] Would upload ${filename} → ${publicId}`);
    } else {
      try {
        uploadResult = await uploadAudio(filePath, {
          publicId,
          tags: combinedTags,
          context: cloudContext,
        });
        console.log(`Uploaded ${filename} → ${publicId}`);
      } catch (err) {
        if (err.http_code === 409) {
          console.log(`Cloudinary asset exists for ${publicId}, fetching`);
          uploadResult = await getAsset(publicId);
        } else {
          console.error(`Upload failed for ${filename}:`, err.message);
          skipped += 1;
          continue;
        }
      }
    }

    const secureUrl = uploadResult ? uploadResult.secure_url || uploadResult.url : null;

    const curatedYear = curated && curated.year ? parseInt(curated.year, 10) : null;
    const set = {
      title,
      source_type: (curated && curated.source_type) || argv['source-type'],
      year: Number.isFinite(curatedYear)
        ? curatedYear
        : Number.isFinite(year)
          ? year
          : new Date().getFullYear(),
      timestamp,
      source: {
        title: info.title || parentDir,
        platform: info.extractor_key || 'YouTube',
        url: info.webpage_url || null,
        creator: info.uploader || info.channel || null,
        channel: info.channel || null,
        channel_url: info.channel_url || null,
      },
      goat: {},
      audio: {
        duration,
        intensity: curatedIntensity || intensity,
        category,
      },
      meme_status: curatedMemeStatus,
      context,
      approved: curatedApproved,
      last_curated_at: curated ? new Date() : undefined,
    };

    if (!curated) {
      delete set.last_curated_at;
    }

    if (curatedLicense) {
      set.license = curatedLicense;
    }

    const mediaSet = {};
    if (secureUrl) {
      mediaSet['media.audio.mp3.high'] = secureUrl;
      mediaSet['media.audio.mp3.medium'] = secureUrl;
      mediaSet['media.audio.mp3.low'] = secureUrl;
    }

    const update = {
      $set: {
        ...set,
        ...mediaSet,
        tags: combinedTags,
      },
      $setOnInsert: {
        id,
        date_added: uploadDate
          ? new Date(
              `${String(uploadDate).slice(0, 4)}-${String(uploadDate).slice(4, 6)}-${String(uploadDate).slice(6, 8)}`
            )
          : new Date(),
        stats: { api_calls: 0, downloads: 0, favorites: 0 },
      },
    };

    if (curatedAnalysis) {
      const filteredAnalysis = {
        descriptor: curatedAnalysis.descriptor || null,
        vibe: curatedAnalysis.vibe || null,
        tags: Array.from(new Set(curatedAnalysis.tags || [])),
        primary_note: curatedAnalysis.primary_note || null,
        tones_in_order: Array.from(new Set(curatedAnalysis.tones_in_order || [])),
      };
      if (
        filteredAnalysis.descriptor ||
        filteredAnalysis.vibe ||
        filteredAnalysis.tags.length ||
        filteredAnalysis.primary_note ||
        filteredAnalysis.tones_in_order.length
      ) {
        update.$set.analysis = filteredAnalysis;
      }
      if (curatedIntensity != null) {
        update.$set.analysis = update.$set.analysis || {};
        update.$set.analysis.intensity_override = curatedIntensity;
      }
    }

    if (argv['dry-run']) {
      console.log(`[dry-run] Would upsert ${id} (${filename})`);
    } else {
      if (!mongoReady) {
        console.error('Mongo connection lost');
        skipped += 1;
        continue;
      }
      await GoatScream.updateOne({ id }, update, { upsert: true });
      console.log(`Upserted ${id}`);
    }

    processed += 1;
  }

  console.log(`Done. processed=${processed}, skipped=${skipped}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
