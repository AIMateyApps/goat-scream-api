const express = require('express');
const router = express.Router();

const ScreamsService = require('../services/screamsService');

const screamsService = new ScreamsService();

// GET /api/screams
router.get('/', async (req, res, next) => {
  try {
    const result = await screamsService.getScreams(req.query);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/screams/random
router.get('/random', async (req, res, next) => {
  try {
    const result = await screamsService.getRandomScreams(req.query);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/screams/ordered/:index (supports ranges like 5-10)
router.get('/ordered/:index', async (req, res, next) => {
  try {
    const { index } = req.params;
    const result = await screamsService.getScreamByOrderedIndex(index);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/screams/intense?limit=10
router.get('/intense', async (req, res, next) => {
  try {
    const limit = req.query.limit || 10;
    const result = await screamsService.getIntenseScreams(limit);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/screams/breeds
router.get('/breeds', async (req, res, next) => {
  try {
    const breeds = await screamsService.getBreeds();
    return res.json(breeds);
  } catch (err) {
    next(err);
  }
});

// GET /api/screams/sources
router.get('/sources', async (req, res, next) => {
  try {
    const sources = await screamsService.getSources();
    return res.json(sources);
  } catch (err) {
    next(err);
  }
});

// POST /api/screams/:id/download
router.post('/:id/download', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { format = 'mp3', quality = 'medium' } = req.body || {};
    const result = await screamsService.getDownloadUrl(id, format, quality);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
