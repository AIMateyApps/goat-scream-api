const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();

const KeyRequest = require('../models/KeyRequest');
const ApiKey = require('../models/ApiKey');
const { ValidationError, NotFoundError } = require('../errors');
const { requireAdmin } = require('../utils/auth');

router.post('/requests', async (req, res, next) => {
  try {
    const { name, email, intended_use } = req.body || {};
    if (!name || !email) {
      throw new ValidationError('name and email are required');
    }
    const doc = await KeyRequest.create({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      intended_use: intended_use || null,
    });
    res
      .status(202)
      .json({ message: 'Request received', request: { id: doc._id, status: doc.status } });
  } catch (err) {
    next(err);
  }
});

router.get('/requests', requireAdmin, async (req, res) => {
  const { status = 'pending', limit = 50 } = req.query;
  const filter = status === 'all' ? {} : { status };
  const docs = await KeyRequest.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(parseInt(limit, 10) || 50, 200)))
    .lean();
  res.json({ items: docs });
});

router.patch('/requests/:id/approve', requireAdmin, async (req, res, next) => {
  try {
    const request = await KeyRequest.findById(req.params.id);
    if (!request) {
      throw new NotFoundError('Request not found', 'key_request');
    }
    if (request.status === 'approved') {
      throw new ValidationError('Request already approved');
    }

    const quota = Number(req.body.quota) || 200;
    const tier = req.body.tier || 'basic';
    const keyDoc = await ApiKey.create({
      key: `gsa_${randomUUID().replace(/-/g, '')}`,
      label: `${request.name} (${request.email})`,
      tier,
      quota_per_minute: quota,
    });

    request.status = 'approved';
    request.notes = `API key issued: ${keyDoc.key}`;
    await request.save();

    res.json({ message: 'Approved and issued key', api_key: keyDoc.key });
  } catch (err) {
    next(err);
  }
});

router.patch('/requests/:id/reject', requireAdmin, async (req, res, next) => {
  try {
    const request = await KeyRequest.findById(req.params.id);
    if (!request) {
      throw new NotFoundError('Request not found', 'key_request');
    }
    request.status = 'rejected';
    request.notes = req.body.notes || request.notes;
    await request.save();
    res.json({ message: 'Request rejected', id: request._id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
