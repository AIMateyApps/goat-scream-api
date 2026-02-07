const express = require('express');
const Submission = require('../models/Submission');
const GoatScream = require('../models/GoatScream');
const { promoteSubmissionAudio, deleteSubmissionAudio } = require('../services/storage');
const { getDbStatus } = require('../db/connection');
const { ValidationError, NotFoundError, ExternalServiceError } = require('../errors');
const { warn: logWarn } = require('../utils/logger');
const { requireAdmin } = require('../utils/auth');
const { parseBool, parseTags } = require('../utils/parsing');

const router = express.Router();

// Check if Advanced API features are enabled (MongoDB required for moderation)
function requireFullStack(req, res, next) {
  const db = getDbStatus();
  if (!db.connected || process.env.FULL_STACK !== 'true') {
    return res.status(503).json({
      error: 'Moderation endpoint requires Advanced API setup',
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

router.use(requireFullStack);
router.use(requireAdmin);

router.get('/submissions', async (req, res, next) => {
  try {
    const { status = 'pending_review', limit = 20, page = 1 } = req.query;
    const filter = {};
    if (status !== 'all') filter.status = status;
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

    res.json({ page: p, limit: l, total, items });
  } catch (err) {
    next(err);
  }
});

router.patch('/submissions/:id/approve', async (req, res, next) => {
  try {
    const { id } = req.params;
    const submission = await Submission.findOne({ id });
    if (!submission) {
      throw new NotFoundError('Submission not found', 'submission');
    }
    if (submission.status === 'approved') {
      throw new ValidationError('Submission already approved');
    }

    const targetId =
      req.body.goat_scream_id || submission.goat_scream_id || `user-${submission.id}`;
    const promotion = await promoteSubmissionAudio(submission.cloudinary_public_id, targetId);

    const tags = parseTags(req.body.tags, submission.metadata?.tags || []);
    const memeStatus = req.body.meme_status || 'emerging';
    const sourceType = req.body.source_type || 'user_submission';
    const license = {
      type: req.body.license_type || 'user_generated',
      url: req.body.license_url || submission.source?.url || null,
      attribution_required: parseBool(req.body.attribution_required ?? false),
      attribution_text: req.body.attribution_text || null,
      notes: req.body.license_notes || null,
    };

    const intensity = submission.analysis?.intensity || submission.audio?.intensity || 5;
    const duration = submission.audio?.duration || submission.analysis?.duration || 2;

    const goatSet = {
      title: req.body.title || submission.title,
      source_type: sourceType,
      year: submission.year || null,
      context: submission.context || null,
      tags,
      meme_status: memeStatus,
      last_curated_at: new Date(),
      source: submission.source || { title: submission.title, platform: 'user_submission' },
      audio: {
        duration,
        intensity,
        category: submission.analysis?.category || 'short_burst',
      },
      license,
      approved: true,
    };

    const mediaSet = {
      'media.audio.mp3.high': promotion.url,
      'media.audio.mp3.medium': promotion.url,
      'media.audio.mp3.low': promotion.url,
    };

    await GoatScream.updateOne(
      { id: targetId },
      {
        $set: {
          ...goatSet,
          ...mediaSet,
        },
        $setOnInsert: {
          id: targetId,
          date_added: new Date(),
          stats: { api_calls: 0, downloads: 0, favorites: 0 },
        },
      },
      { upsert: true }
    );

    submission.status = 'approved';
    submission.goat_scream_id = targetId;
    submission.review_notes = req.body.review_notes || null;
    submission.cloudinary_public_id = promotion.publicId;
    await submission.save();

    res.json({
      message: 'Submission approved and promoted',
      goat_scream_id: targetId,
      media_url: promotion.url,
    });
  } catch (err) {
    // If it's already an AppError, pass it through
    if (err.isOperational !== undefined) {
      return next(err);
    }
    // Wrap unknown errors as external service errors
    return next(new ExternalServiceError('Failed to approve submission', 'cloudinary', err));
  }
});

router.patch('/submissions/:id/reject', async (req, res, next) => {
  try {
    const { id } = req.params;
    const submission = await Submission.findOne({ id });
    if (!submission) {
      throw new NotFoundError('Submission not found', 'submission');
    }
    if (submission.status === 'approved') {
      throw new ValidationError('Cannot reject an already approved submission');
    }

    const deleteMedia =
      req.body.delete_media === undefined ? true : parseBool(req.body.delete_media);

    if (deleteMedia && submission.cloudinary_public_id) {
      await deleteSubmissionAudio(submission.cloudinary_public_id).catch(err => {
        logWarn('Failed to delete Cloudinary asset for submission', {
          submission_id: id,
          error: err.message,
        });
      });
      submission.cloudinary_public_id = null;
    }

    submission.status = 'rejected';
    submission.review_notes = req.body.review_notes || null;
    await submission.save();

    res.json({ message: 'Submission rejected', id: submission.id });
  } catch (err) {
    // If it's already an AppError, pass it through
    if (err.isOperational !== undefined) {
      return next(err);
    }
    // Wrap unknown errors
    return next(
      new ExternalServiceError('Failed to reject submission', 'submission_processing', err)
    );
  }
});

module.exports = router;
