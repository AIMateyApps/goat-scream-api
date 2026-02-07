const { getScreamsRepository } = require('../repositories');
const { buildMongoFilter, parseBoolean, clone, deepGet } = require('../utils/filters');
const { recordAccess } = require('../utils/stats');
const { getDbStatus } = require('../db/connection');
const { NotFoundError, ValidationError } = require('../errors');
const { getStaticScreams } = require('../utils/staticScreams');
const cache = require('./cache');

/**
 * Service layer for screams operations
 * Handles business logic and delegates data access to repositories
 */
class ScreamsService {
  constructor(repository = null) {
    // Allow injection for testing, otherwise get dynamically
    this._repository = repository;
  }

  get repository() {
    // Get repository dynamically based on current DB status
    return this._repository || getScreamsRepository();
  }

  /**
   * Get paginated list of screams
   * @param {Object} query - Query parameters
   * @param {string} query.include_unapproved - Include unapproved screams
   * @param {string} query.limit - Page size
   * @param {string} query.page - Page number
   * @param {string} query.all - Return all results (up to 5000)
   * @param {Object} query - Additional filter parameters
   * @returns {Promise<Object>} Paginated result with items, total, page, limit
   */
  async getScreams(query) {
    const includeUnapproved =
      parseBoolean(query.include_unapproved) || parseBoolean(query.includeUnapproved);
    const rawLimit = parseInt(query.limit, 10);
    const rawPage = parseInt(query.page, 10);
    const eagerAll =
      parseBoolean(query.all) ||
      parseBoolean(query.full) ||
      (typeof query.limit === 'string' && query.limit.toLowerCase() === 'all');

    const maxLimit = eagerAll ? 5000 : 500;
    let limit = Number.isNaN(rawLimit) ? 100 : rawLimit;
    if (limit <= 0 || eagerAll) limit = maxLimit;
    limit = Math.max(1, Math.min(limit, maxLimit));
    const page = Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage);

    const filter = buildMongoFilter(query, { includeUnapproved });
    const [items, total] = await Promise.all([
      this.repository.find(filter, {
        sort: { date_added: 1, id: 1 },
        skip: (page - 1) * limit,
        limit,
      }),
      this.repository.count(filter),
    ]);

    const db = getDbStatus();
    return {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      source: db.connected ? 'mongo' : 'static',
      items,
    };
  }

  /**
   * Get random screams
   * @param {Object} query - Query parameters
   * @param {string} query.results - Number of random results (default: 1, max: 50)
   * @param {string} query.sort - Sort field
   * @param {string} query.direction - Sort direction (asc/desc)
   * @param {Object} query - Additional filter parameters
   * @returns {Promise<Object|Array>} Single scream object or array of screams
   */
  async getRandomScreams(query) {
    const { results = 1, sort, direction = 'desc' } = query;

    // Random results should not be cached to keep successive calls fresh
    const filter = buildMongoFilter(query);
    const n = Math.max(1, Math.min(parseInt(results, 10) || 1, 50));

    const picks = await this.repository.findRandom(filter, n);

    if (!picks.length) {
      throw new NotFoundError('No screams available');
    }

    // Sort if requested
    if (sort && picks.length > 1) {
      const dir = direction === 'asc' ? 1 : -1;
      const field = sort === 'intensity' ? 'audio.intensity' : sort;
      picks.sort((a, b) => {
        const av = field.includes('.') ? deepGet(a, field) : a[field];
        const bv = field.includes('.') ? deepGet(b, field) : b[field];
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * dir;
      });
    }

    // Record access for MongoDB (static data stats are handled separately)
    const db = getDbStatus();
    if (db.connected) {
      await recordAccess(picks);
    }

    return n === 1 ? picks[0] : picks;
  }

  /**
   * Get scream by ID
   * @param {string} id - Scream ID
   * @returns {Promise<Object>} Scream object
   */
  async getScreamById(id) {
    const scream = await this.repository.findById(id);
    if (!scream) {
      throw new NotFoundError('Scream not found', 'scream');
    }
    return scream;
  }

  /**
   * Get scream by ordered index
   * @param {string} index - Index or range (e.g., "5" or "5-10")
   * @returns {Promise<Object|Array>} Single scream or array of screams
   */
  async getScreamByOrderedIndex(index) {
    const isRange = index.includes('-');
    const db = getDbStatus();

    if (db.connected) {
      if (isRange) {
        const [startStr, endStr] = index.split('-');
        const start = Math.max(0, parseInt(startStr, 10));
        const end = Math.max(start, parseInt(endStr, 10));
        const limit = end - start + 1;
        const screams = await this.repository.find(
          { approved: true },
          {
            sort: { date_added: 1 },
            skip: start,
            limit,
          }
        );
        return screams;
      }

      const i = Math.max(0, parseInt(index, 10));
      if (Number.isNaN(i)) {
        throw new ValidationError('Invalid index', { field: 'index', value: index });
      }
      const screams = await this.repository.find(
        { approved: true },
        {
          sort: { date_added: 1 },
          skip: i,
          limit: 1,
        }
      );
      if (!screams.length) {
        throw new NotFoundError('Scream not found', 'scream');
      }
      return screams[0];
    }

    // Static fallback
    const staticScreams = getStaticScreams();
    const list = [...staticScreams]
      .filter(s => s.approved !== false)
      .sort((a, b) => new Date(a.date_added) - new Date(b.date_added));

    if (isRange) {
      const [startStr, endStr] = index.split('-');
      const start = Math.max(0, parseInt(startStr, 10));
      const end = Math.max(start, parseInt(endStr, 10));
      const slice = list.slice(start, end + 1).map(clone);
      return slice;
    }

    const i = Math.max(0, parseInt(index, 10));
    if (Number.isNaN(i) || i >= list.length) {
      throw new NotFoundError('Scream not found', 'scream');
    }
    return clone(list[i]);
  }

  /**
   * Get most intense screams
   * @param {number} limit - Maximum number of screams to return
   * @returns {Promise<Array>} Array of screams sorted by intensity
   */
  async getIntenseScreams(limit = 10) {
    const limitNum = Math.max(1, parseInt(limit, 10) || 10);

    // Check cache for intense screams (60s TTL)
    const cacheKey = cache.generateKey('screams:intense', { limit: limitNum });
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const screams = await this.repository.find(
      { approved: true },
      {
        sort: { 'audio.intensity': -1 },
        limit: limitNum,
      }
    );

    // Record access for MongoDB
    const db = getDbStatus();
    if (db.connected) {
      await recordAccess(screams);
    }

    // Cache result (60s TTL)
    await cache.set(cacheKey, screams, 60);

    return screams;
  }

  /**
   * Get list of unique breeds
   * @returns {Promise<Array>} Array of breed names
   */
  async getBreeds() {
    const breeds = await this.repository.distinct('goat.breed', { approved: true });
    return breeds.filter(Boolean);
  }

  /**
   * Get list of sources with counts
   * @returns {Promise<Array>} Array of source objects with title, type, and count
   */
  async getSources() {
    const sources = await this.repository.aggregate([
      { $match: { approved: true } },
      { $group: { _id: '$source.title', type: { $first: '$source_type' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return sources;
  }

  /**
   * Get download URL for a scream
   * @param {string} id - Scream ID
   * @param {string} format - Audio format (mp3, wav, ogg)
   * @param {string} quality - Quality level (high, medium, low)
   * @returns {Promise<Object>} Download information
   */
  async getDownloadUrl(id, format = 'mp3', quality = 'medium') {
    const scream = await this.getScreamById(id);
    const audioFormats = scream.media?.audio || {};
    const formatObj = audioFormats[format];

    if (!formatObj) {
      throw new ValidationError('Unsupported audio format', {
        field: 'format',
        value: format,
        supported_formats: Object.keys(audioFormats),
      });
    }

    const url = formatObj[quality];
    if (!url) {
      throw new ValidationError('Unsupported quality for requested format', {
        field: 'quality',
        value: quality,
        supported_qualities: Object.keys(formatObj),
      });
    }

    // Update download stats (MongoDB only - static data is immutable)
    const db = getDbStatus();
    if (db.connected) {
      await this.repository.updateOne(
        { id },
        {
          $inc: { 'stats.downloads': 1 },
          $set: {
            'stats.last_accessed_at': new Date(),
            'stats.last_accessed_date': new Date().toISOString().slice(0, 10),
          },
        }
      );
      await recordAccess([scream]);
    }

    return {
      download_url: url,
      format,
      quality,
      filename: `goat_scream_${scream.id}.${format}`,
    };
  }
}

module.exports = ScreamsService;
