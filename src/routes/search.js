const express = require('express');
const router = express.Router();

const SearchService = require('../services/searchService');

const searchService = new SearchService();

router.get('/', async (req, res, next) => {
  try {
    const result = await searchService.searchScreams(req.query);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
