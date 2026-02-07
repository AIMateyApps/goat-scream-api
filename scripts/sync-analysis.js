#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const { parse } = require('csv-parse/sync');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const { connectMongo } = require('../src/db/connection');
const GoatScream = require('../src/models/GoatScream');

function perror(message) {
  process.stderr.write(`${message}\n`);
}

function normalizeCell(value) {
  if (value == null) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function sanitizeDash(value) {
  const v = normalizeCell(value);
  if (!v) return null;
  const cleaned = v.replace(/\u2014/g, '-').trim();
  if (!cleaned || cleaned === '-' || cleaned.toLowerCase() === 'none') return null;
  return cleaned;
}

function parseTagsList(value) {
  const cell = normalizeCell(value);
  if (!cell) return [];
  return cell
    .split(',')
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => token.replace(/\s+/g, ' '))
    .map(token => token.replace(/\u2014/g, '-'));
}

function _parseAnalysisTags(value) {
  const cell = normalizeCell(value);
  if (!cell) return [];
  return cell
    .split(/[,|]/)
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => token.replace(/\u2014/g, '-'));
}

function parseToneSequence(value) {
  const cell = normalizeCell(value).replace(/;/g, '|');
  if (!cell) return [];
  return cell
    .split('|')
    .map(token => token.trim())
    .map(token => token.replace(/\u2014/g, '-'))
    .filter(token => token && token !== '-');
}

function toInt(value) {
  const num = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(num) ? num : null;
}

function serializeCsv(rows, headers) {
  const escapeCell = value => {
    if (value == null) return '';
    const str = String(value);
    const needsQuotes = /["\n,]/.test(str);
    const escaped = str.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const lines = [headers.join(',')];
  rows.forEach(row => {
    const values = headers.map(key => escapeCell(row[key]));
    lines.push(values.join(','));
  });
  if (!lines[lines.length - 1].endsWith('\n')) {
    lines[lines.length - 1] = `${lines[lines.length - 1]}`;
  }
  return `${lines.join('\n')}\n`;
}

function loadCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

function writeCsv(filePath, rows, headers) {
  const csvText = serializeCsv(rows, headers);
  fs.writeFileSync(filePath, csvText, 'utf8');
}

function analysisFromRow(row) {
  const descriptor = normalizeCell(row.descriptor);
  const vibe = normalizeCell(row.vibe);
  const tags = parseTagsList(row.tags);
  const primaryNote = sanitizeDash(row.primary_note);
  const toneSeq = parseToneSequence(row.tones_in_order);
  const intensity = toInt(row.intensity_1_10);

  const fileCell = normalizeCell(row.file);
  const normalizedFile = fileCell.replace(/\\/g, '/');
  const baseName = path.basename(normalizedFile);
  const videoIdMatch = normalizedFile.match(/\[([^\]]+)\]/);
  const videoId = videoIdMatch ? videoIdMatch[1] : null;
  let derivedId = null;

  if (normalizedFile.startsWith('output/')) {
    const clipMatch = normalizedFile.match(/_clip_(\d{1,3})_/i);
    if (clipMatch && videoId) {
      const clipNumber = clipMatch[1].padStart(3, '0');
      derivedId = `ytb-${videoId}-c${clipNumber}`;
    }
  }

  return {
    descriptor: descriptor || null,
    vibe: vibe || null,
    tags,
    primary_note: primaryNote,
    tones_in_order: toneSeq,
    intensity,
    source_file: normalizedFile,
    base_name: baseName,
    video_id: videoId,
    derived_id: derivedId,
  };
}

function buildAnalysisIndex(rows) {
  const byVideo = new Map();
  const byFilename = new Map();
  const entries = [];

  rows.forEach(row => {
    const entry = analysisFromRow(row);
    entries.push(entry);
    if (entry.video_id) {
      const key = entry.video_id.toLowerCase();
      if (!byVideo.has(key)) {
        byVideo.set(key, entry);
      }
    }
    if (entry.base_name) {
      const key = entry.base_name.toLowerCase();
      if (!byFilename.has(key)) {
        byFilename.set(key, entry);
      }
    }
  });

  return { byVideo, byFilename, entries };
}

function extractVideoIdFromClipId(id) {
  if (!id) return null;
  const match = String(id).match(/^ytb-(.+)-c\d+$/i);
  return match ? match[1] : null;
}

function mapCuratedRows(rows, mode, index, report) {
  const updatedRows = [];
  const analysisMap = new Map();
  const unmatched = [];

  rows.forEach(originalRow => {
    const row = { ...originalRow };
    const filenameKey = normalizeCell(row.filename).toLowerCase();
    const videoId = extractVideoIdFromClipId(row.id);
    let analysisEntry = null;

    if (filenameKey) {
      analysisEntry = index.byFilename.get(filenameKey);
    }
    if (!analysisEntry && videoId) {
      analysisEntry = index.byVideo.get(videoId.toLowerCase());
    }

    if (!analysisEntry) {
      unmatched.push(row.id);
    } else {
      const tags = analysisEntry.tags;
      const tones = analysisEntry.tones_in_order;
      const descriptor = analysisEntry.descriptor;
      const vibe = analysisEntry.vibe;
      const primaryNote = analysisEntry.primary_note;
      const intensity = analysisEntry.intensity;

      if (intensity != null) {
        row.intensity = String(intensity);
        row.analysis_intensity = String(intensity);
      } else {
        row.analysis_intensity = '';
      }

      row.analysis_descriptor = descriptor || '';
      row.analysis_vibe = vibe || '';
      row.analysis_tags = tags.length ? tags.join('|') : '';
      row.analysis_primary_note = primaryNote || '';
      row.analysis_tones = tones.length ? tones.join('|') : '';
      row.analysis_source_file = analysisEntry.source_file || '';

      const analysisDoc = {
        descriptor: descriptor || null,
        vibe: vibe || null,
        tags,
        primary_note: primaryNote || null,
        tones_in_order: tones,
        source_file: analysisEntry.source_file,
        intensity,
      };

      analysisMap.set(row.id, analysisDoc);
    }

    if (!analysisEntry) {
      row.analysis_descriptor = row.analysis_descriptor || '';
      row.analysis_vibe = row.analysis_vibe || '';
      row.analysis_tags = row.analysis_tags || '';
      row.analysis_primary_note = row.analysis_primary_note || '';
      row.analysis_tones = row.analysis_tones || '';
      row.analysis_source_file = row.analysis_source_file || '';
      row.analysis_intensity = row.analysis_intensity || '';
    }

    updatedRows.push(row);
  });

  report.push({
    dataset: mode,
    total: rows.length,
    matched: analysisMap.size,
    unmatched,
  });

  return { updatedRows, analysisMap };
}

function updateStaticJson(filePath, analysisMap) {
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let updated = 0;
  const missing = [];

  const idToAnalysis = new Map(analysisMap);

  const next = json.map(entry => {
    if (!entry || !entry.id) return entry;
    const data = idToAnalysis.get(entry.id);
    if (!data) {
      missing.push(entry.id);
      return entry;
    }

    const analysis = {
      descriptor: data.descriptor || null,
      vibe: data.vibe || null,
      tags: Array.isArray(data.tags) ? data.tags : [],
      primary_note: data.primary_note || null,
      tones_in_order: Array.isArray(data.tones_in_order) ? data.tones_in_order : [],
    };

    if (data.intensity != null) {
      analysis.intensity_override = data.intensity;
      entry.audio = entry.audio || {};
      entry.audio.intensity = data.intensity;
    } else if (entry.audio && entry.audio.intensity) {
      analysis.intensity_override = entry.audio.intensity;
    }

    entry.analysis = analysis;
    updated += 1;
    return entry;
  });

  return { next, updated, missingStatic: missing };
}

async function updateMongoDocuments(analysisMap) {
  const status = await connectMongo();
  if (!status.connected) {
    throw new Error(`Mongo connection failed: ${status.error || 'unknown error'}`);
  }

  let updated = 0;
  let skipped = 0;

  for (const [id, data] of analysisMap.entries()) {
    const set = {
      analysis: {
        descriptor: data.descriptor || null,
        vibe: data.vibe || null,
        tags: Array.isArray(data.tags) ? data.tags : [],
        primary_note: data.primary_note || null,
        tones_in_order: Array.isArray(data.tones_in_order) ? data.tones_in_order : [],
      },
    };

    if (data.intensity != null) {
      set.analysis.intensity_override = data.intensity;
    }

    const update = { $set: set };
    if (data.intensity != null) {
      update.$set['audio.intensity'] = data.intensity;
    }

    const res = await GoatScream.updateOne({ id }, update);
    if (res.matchedCount > 0) {
      updated += res.modifiedCount > 0 ? 1 : 0;
    } else {
      skipped += 1;
    }
  }

  await mongoose.disconnect();
  return { updated, skipped };
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('csv', {
      type: 'string',
      describe: 'Path to the analysis CSV',
      default: path.resolve(process.cwd(), 'goat_scream_analysis (3).csv'),
    })
    .option('write', {
      type: 'boolean',
      default: false,
      describe: 'Write back to curated CSVs and analysis map JSON',
    })
    .option('mongo', {
      type: 'boolean',
      default: false,
      describe: 'Apply updates directly to MongoDB (requires MONGODB_URI)',
    })
    .option('update-json', {
      type: 'boolean',
      default: false,
      describe: 'Update data/screams-public.json snapshot',
    })
    .option('analysis-map', {
      type: 'string',
      default: path.resolve(process.cwd(), 'data/analysis-map.json'),
      describe: 'Output path for the normalized analysis map JSON',
    })
    .option('dry-run', {
      type: 'boolean',
      default: false,
      describe: 'Print summary without mutating files or databases',
    })
    .help()
    .alias('h', 'help').argv;

  const analysisRows = loadCsv(argv.csv);
  const index = buildAnalysisIndex(analysisRows);

  const curatedStandardPath = path.resolve(process.cwd(), 'data/curated-screams.csv');
  const curatedAiPath = path.resolve(process.cwd(), 'data/curated-ai.csv');

  const curatedStandardRows = loadCsv(curatedStandardPath);
  const curatedAiRows = loadCsv(curatedAiPath);

  const report = [];
  const { updatedRows: standardUpdated, analysisMap: standardMap } = mapCuratedRows(
    curatedStandardRows,
    'curated-screams',
    index,
    report
  );
  const { updatedRows: aiUpdated, analysisMap: aiMap } = mapCuratedRows(
    curatedAiRows,
    'curated-ai',
    index,
    report
  );

  const derivedMap = new Map();
  index.entries.forEach(entry => {
    if (entry.derived_id) {
      derivedMap.set(entry.derived_id, entry);
    }
  });

  const mergedMap = new Map([
    ...derivedMap.entries(),
    ...standardMap.entries(),
    ...aiMap.entries(),
  ]);

  const headersStandard = [
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
    'analysis_descriptor',
    'analysis_vibe',
    'analysis_tags',
    'analysis_primary_note',
    'analysis_tones',
    'analysis_source_file',
    'analysis_intensity',
  ];

  const headersAi = [
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
    'analysis_descriptor',
    'analysis_vibe',
    'analysis_tags',
    'analysis_primary_note',
    'analysis_tones',
    'analysis_source_file',
    'analysis_intensity',
  ];

  const analysisMapOut = {};
  mergedMap.forEach((value, key) => {
    analysisMapOut[key] = {
      descriptor: value.descriptor || null,
      vibe: value.vibe || null,
      tags: value.tags || [],
      primary_note: value.primary_note || null,
      tones_in_order: value.tones_in_order || [],
      source_file: value.source_file || null,
      intensity: value.intensity != null ? value.intensity : null,
    };
  });

  const summary = {
    analysisRows: analysisRows.length,
    datasets: report,
    mappedIds: mergedMap.size,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (argv.dryRun) {
    console.log('Dry-run mode enabled; no files or databases were modified.');
    return;
  }

  if (argv.write) {
    writeCsv(curatedStandardPath, standardUpdated, headersStandard);
    writeCsv(curatedAiPath, aiUpdated, headersAi);
    await fsp.writeFile(argv.analysisMap, JSON.stringify(analysisMapOut, null, 2));
    console.log(`Wrote curated CSV updates and analysis map to ${argv.analysisMap}`);
  }

  if (argv.updateJson) {
    const snapshotPath = path.resolve(process.cwd(), 'data/screams-public.json');
    if (fs.existsSync(snapshotPath)) {
      const { next, updated, missingStatic } = updateStaticJson(snapshotPath, mergedMap);
      await fsp.writeFile(snapshotPath, JSON.stringify(next, null, 2));
      console.log(
        `Updated ${updated} entries in data/screams-public.json (missing: ${missingStatic.length})`
      );
    } else {
      perror('data/screams-public.json not found; skipped snapshot update.');
    }
  }

  if (argv.mongo) {
    try {
      const mongoResult = await updateMongoDocuments(mergedMap);
      console.log(
        `Mongo update complete. Modified: ${mongoResult.updated}, skipped (no match): ${mongoResult.skipped}`
      );
    } catch (err) {
      perror(`Mongo update failed: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

main().catch(err => {
  perror(err.stack || err.message);
  process.exit(1);
});
