const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
// crypto is a built-in global in Node.js 20+
const axios = require('axios');
const multer = require('multer');
const { analyzeAudio } = require('../services/analysis');
const Submission = require('../models/Submission');
const { uploadSubmissionAudio } = require('../services/storage');
const { getDbStatus } = require('../db/connection');
const { ValidationError, ExternalServiceError } = require('../errors');

const router = express.Router();

// Check if Advanced API features are enabled (MongoDB required for submissions)
function requireFullStack(req, res, next) {
  const db = getDbStatus();
  if (!db.connected || process.env.FULL_STACK !== 'true') {
    return res.status(503).json({
      error: 'Submissions endpoint requires Advanced API setup',
      message: 'This endpoint requires MongoDB. To enable:',
      instructions: [
        '1. Set FULL_STACK=true in your .env file',
        '2. Set MONGODB_URI to your MongoDB connection string',
        '3. Restart the server',
      ],
      documentation: 'See docs/enable-advanced-api.md in the repository',
    });
  }
  return next();
}

const uploadDir = path.join(process.cwd(), 'tmp', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const base = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${base}`);
  },
});

// Allowed audio MIME types for goat scream submissions
const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg', // .mp3
  'audio/mp3', // alternate mp3 mime
  'audio/wav', // .wav
  'audio/wave', // alternate wav mime
  'audio/x-wav', // alternate wav mime
  'audio/ogg', // .ogg
  'audio/flac', // .flac
  'audio/x-flac', // alternate flac mime
  'audio/mp4', // .m4a
  'audio/x-m4a', // alternate m4a mime
  'audio/aac', // .aac
  'audio/webm', // .webm audio
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new ValidationError(
          `Invalid file type: ${file.mimetype}. Allowed types: MP3, WAV, OGG, FLAC, M4A, AAC, WebM`
        ),
        false
      );
    }
  },
});

function generateSubmissionId() {
  return `sub_${crypto.randomUUID()}`;
}

function validateBody(body) {
  const errors = [];
  if (!body.title || String(body.title).trim().length < 3) {
    errors.push('title is required (min 3 chars)');
  }
  if (body.year != null) {
    const y = Number(body.year);
    if (!Number.isInteger(y) || y < 1900 || y > 2100)
      errors.push('year must be an integer between 1900 and 2100');
  }
  return errors;
}

async function downloadRemoteAudio(url, submissionId) {
  const targetExt = path.extname(new URL(url).pathname) || '.mp3';
  const targetPath = path.join(uploadDir, `${submissionId}${targetExt}`);
  const response = await axios({ url, method: 'GET', responseType: 'stream' });
  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(targetPath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
  return targetPath;
}

function buildSourceMeta(raw) {
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed;
    } catch {
      return { title: raw };
    }
  }
  return raw;
}

function sanitizeYear(year) {
  if (!year && year !== 0) return undefined;
  const parsed = Number(year);
  if (Number.isInteger(parsed) && parsed >= 1900 && parsed <= 2100) return parsed;
  return undefined;
}

router.use(requireFullStack);

router.post('/', upload.single('audio'), async (req, res, next) => {
  const { title, source, context, year, audio_url, tags } = req.body || {};
  const errors = validateBody({ title, year });
  if (!req.file && !audio_url) {
    errors.push('audio file or audio_url is required');
  }
  if (errors.length) {
    return next(new ValidationError('Validation failed', errors));
  }

  const submissionId = generateSubmissionId();
  let localPath = req.file ? req.file.path : null;
  try {
    if (!localPath && audio_url) {
      localPath = await downloadRemoteAudio(audio_url, submissionId);
    }

    const analysis = await analyzeAudio(localPath);

    const uploadResult = await uploadSubmissionAudio(localPath, submissionId, {
      tags: Array.isArray(tags) ? tags : [],
      context: {
        submission_id: submissionId,
        title,
      },
    });

    const submissionDoc = await Submission.create({
      id: submissionId,
      title: String(title).trim(),
      source: buildSourceMeta(source) || undefined,
      context: context || undefined,
      year: sanitizeYear(year),
      status: 'pending_review',
      analysis,
      audio: {
        original_url: audio_url || null,
        duration: analysis?.duration || uploadResult.duration,
        intensity: analysis?.intensity || null,
        category: analysis?.category || null,
        cloudinary_url: uploadResult.url,
      },
      submitter_ip: req.ip,
      cloudinary_public_id: uploadResult.publicId,
      metadata: {
        tags: Array.isArray(tags) ? tags : parseTagsValue(tags),
        user_agent: req.headers['user-agent'],
      },
    });

    return res.status(202).json({
      message: 'Thanks! Your goat scream is under review.',
      estimatedReview: '24-48 hours',
      submission: {
        id: submissionDoc.id,
        status: submissionDoc.status,
        analysis: submissionDoc.analysis,
        audio_url: submissionDoc.audio.cloudinary_url,
      },
    });
  } catch (err) {
    // If it's already an AppError, pass it through
    if (err.isOperational !== undefined) {
      return next(err);
    }
    // Wrap unknown errors (likely from Cloudinary or analysis service)
    if (err.response || err.request) {
      // Axios error (HTTP error from remote service)
      return next(new ExternalServiceError('Failed to download audio file', 'audio_download', err));
    }
    // Wrap other errors as external service errors (Cloudinary, analysis, etc.)
    return next(
      new ExternalServiceError('Failed to process submission', 'submission_processing', err)
    );
  } finally {
    if (localPath && !req.file) {
      await fsp.unlink(localPath).catch(() => {});
    }
    if (req.file) {
      await fsp.unlink(req.file.path).catch(() => {});
    }
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { status, limit = 20, page = 1 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const l = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
    const p = Math.max(1, parseInt(page, 10) || 1);

    const [items, total] = await Promise.all([
      Submission.find(filter)
        .sort({ createdAt: -1 })
        .skip((p - 1) * l)
        .limit(l)
        .lean(),
      Submission.countDocuments(filter),
    ]);

    return res.json({ page: p, limit: l, total, items });
  } catch (err) {
    next(err);
  }
});

function parseTagsValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(/[,|]/)
    .map(token => token.trim())
    .filter(Boolean);
}

module.exports = router;
