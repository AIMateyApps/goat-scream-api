const express = require('express');
const router = express.Router();

const StatsService = require('../services/statsService');

const statsService = new StatsService();

router.get('/', async (req, res, next) => {
  try {
    const stats = await statsService.getStats();
    return res.json(stats);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
