const { getScreamsRepository } = require('../repositories');
const { tokenize, inText, parseRange } = require('../utils/search');
const { recordAccess } = require('../utils/stats');
const { getDbStatus } = require('../db/connection');
const { getStaticScreams } = require('../utils/staticScreams');

/**
 * Service layer for search operations
 * Handles complex search logic with text matching, filters, and sorting
 */
class SearchService {
  constructor(repository = null) {
    // Allow injection for testing, otherwise get dynamically
    this._repository = repository;
  }

  get repository() {
    // Get repository dynamically based on current DB status
    return this._repository || getScreamsRepository();
  }

  /**
   * Search screams with various filters and sorting
   * @param {Object} query - Search query parameters
   * @param {string} query.q - Text search query
   * @param {string} query.intensity_range - Intensity range (e.g., "5-10")
   * @param {string} query.duration_range - Duration range (e.g., "1-5")
   * @param {string} query.years - Year range (e.g., "2020-2023")
   * @param {string} query.tags - Comma-separated tags to include
   * @param {string} query.exclude_tags - Comma-separated tags to exclude
   * @param {string} query.has_video - Filter by video availability
   * @param {string} query.note - Filter by primary musical note (e.g., "G#5", "C4")
   * @param {string} query.page - Page number (default: 1)
   * @param {string} query.limit - Page size (default: 20, max: 100)
   * @param {string} query.sort_by - Sort field (relevance, intensity, year, duration)
   * @returns {Promise<Object>} Paginated search results
   */
  async searchScreams(query) {
    const {
      q,
      intensity_range,
      duration_range,
      years,
      tags,
      exclude_tags,
      has_video,
      note,
      page = 1,
      limit = 20,
      sort_by = 'relevance',
    } = query;

    const db = getDbStatus();
    if (db.connected) {
      return this._searchMongo({
        q,
        intensity_range,
        duration_range,
        years,
        tags,
        exclude_tags,
        has_video,
        note,
        page,
        limit,
        sort_by,
      });
    }

    return this._searchStatic({
      q,
      intensity_range,
      duration_range,
      years,
      tags,
      exclude_tags,
      has_video,
      note,
      page,
      limit,
      sort_by,
    });
  }

  /**
   * Search using MongoDB
   * @private
   */
  async _searchMongo(query) {
    const {
      q,
      intensity_range,
      duration_range,
      years,
      tags,
      exclude_tags,
      has_video,
      note,
      page,
      limit,
      sort_by,
    } = query;

    const filter = { approved: true };
    const or = [];

    // Text search
    if (q) {
      const regex = new RegExp(tokenize(q).join('|'), 'i');
      or.push({ title: regex }, { context: regex }, { 'source.title': regex }, { tags: regex });
    }

    // Numeric ranges
    const ir = parseRange(intensity_range);
    const dr = parseRange(duration_range);
    const yr = parseRange(years);

    // Validate range formats - if provided but completely invalid (both min and max are null), throw validation error
    if (intensity_range && ir && ir.min === null && ir.max === null) {
      const { ValidationError } = require('../errors');
      throw new ValidationError(
        'Invalid intensity_range format. Expected format: "min-max" or "number"',
        {
          field: 'intensity_range',
          value: intensity_range,
        }
      );
    }
    if (duration_range && dr && dr.min === null && dr.max === null) {
      const { ValidationError } = require('../errors');
      throw new ValidationError(
        'Invalid duration_range format. Expected format: "min-max" or "number"',
        {
          field: 'duration_range',
          value: duration_range,
        }
      );
    }
    if (years && yr && yr.min === null && yr.max === null) {
      const { ValidationError } = require('../errors');
      throw new ValidationError('Invalid years format. Expected format: "min-max" or "number"', {
        field: 'years',
        value: years,
      });
    }

    if (ir) {
      filter['audio.intensity'] = {};
      if (ir.min != null) filter['audio.intensity'].$gte = ir.min;
      if (ir.max != null) filter['audio.intensity'].$lte = ir.max;
    }
    if (dr) {
      filter['audio.duration'] = {};
      if (dr.min != null) filter['audio.duration'].$gte = dr.min;
      if (dr.max != null) filter['audio.duration'].$lte = dr.max;
    }
    if (yr) {
      filter.year = {};
      if (yr.min != null) filter.year.$gte = yr.min;
      if (yr.max != null) filter.year.$lte = yr.max;
    }

    // Tag filters
    const andClauses = [];
    if (tags) {
      const need = tags.split(',').map(t => t.trim().toLowerCase());
      andClauses.push({ tags: { $in: need } });
    }
    if (exclude_tags) {
      const ban = exclude_tags.split(',').map(t => t.trim().toLowerCase());
      andClauses.push({ tags: { $nin: ban } });
    }

    // Video filter
    if (typeof has_video !== 'undefined') {
      const hv = String(has_video).toLowerCase();
      const want = hv === 'true' || hv === '1' || hv === 'yes';
      if (want) andClauses.push({ 'media.video': { $exists: true } });
      else andClauses.push({ 'media.video': { $exists: false } });
    }

    // Musical note filter (case-insensitive)
    if (note) {
      const noteRegex = new RegExp(`^${note.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      andClauses.push({ 'analysis.primary_note': noteRegex });
    }

    // Build final query
    const l = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
    const p = Math.max(1, parseInt(page, 10) || 1);

    const baseQuery = or.length ? { $and: [filter, { $or: or }] } : filter;
    const finalQuery = andClauses.length ? { $and: [baseQuery, ...andClauses] } : baseQuery;

    // Sorting
    let sortSpec = {};
    if (sort_by === 'intensity') sortSpec = { 'audio.intensity': -1 };
    else if (sort_by === 'year') sortSpec = { year: -1 };
    else if (sort_by === 'duration') sortSpec = { 'audio.duration': -1 };
    else sortSpec = { remix_count: -1, date_added: -1 }; // relevance fallback

    const [items, total] = await Promise.all([
      this.repository.find(finalQuery, {
        sort: sortSpec,
        skip: (p - 1) * l,
        limit: l,
      }),
      this.repository.count(finalQuery),
    ]);

    await recordAccess(items);

    return { page: p, limit: l, total, items };
  }

  /**
   * Search using static data
   * @private
   */
  async _searchStatic(query) {
    const {
      q,
      intensity_range,
      duration_range,
      years,
      tags,
      exclude_tags,
      has_video,
      note,
      page,
      limit,
      sort_by,
    } = query;

    const list = [...getStaticScreams()];

    // Text query with scoring
    const terms = q ? tokenize(q) : [];
    let scored = list.map(s => {
      let score = 0;
      if (terms.length) {
        const fields = [s.title, s.context, s.source?.title, (s.tags || []).join(' ')].join(' ');
        score = terms.reduce((acc, t) => acc + (inText(fields, [t]) ? 1 : 0), 0);
      }
      return { s, score };
    });

    // Numeric ranges
    const ir = parseRange(intensity_range);
    const dr = parseRange(duration_range);
    const yr = parseRange(years);

    // Validate range formats - if provided but completely invalid (both min and max are null), throw validation error
    if (intensity_range && ir && ir.min === null && ir.max === null) {
      const { ValidationError } = require('../errors');
      throw new ValidationError(
        'Invalid intensity_range format. Expected format: "min-max" or "number"',
        {
          field: 'intensity_range',
          value: intensity_range,
        }
      );
    }
    if (duration_range && dr && dr.min === null && dr.max === null) {
      const { ValidationError } = require('../errors');
      throw new ValidationError(
        'Invalid duration_range format. Expected format: "min-max" or "number"',
        {
          field: 'duration_range',
          value: duration_range,
        }
      );
    }
    if (years && yr && yr.min === null && yr.max === null) {
      const { ValidationError } = require('../errors');
      throw new ValidationError('Invalid years format. Expected format: "min-max" or "number"', {
        field: 'years',
        value: years,
      });
    }

    scored = scored.filter(({ s }) => {
      if (ir) {
        const v = s.audio?.intensity;
        if (ir.min != null && v < ir.min) return false;
        if (ir.max != null && v > ir.max) return false;
      }
      if (dr) {
        const v = s.audio?.duration;
        if (dr.min != null && v < dr.min) return false;
        if (dr.max != null && v > dr.max) return false;
      }
      if (yr) {
        const v = s.year;
        if (yr.min != null && v < yr.min) return false;
        if (yr.max != null && v > yr.max) return false;
      }
      return true;
    });

    // Tag filters
    if (tags) {
      const need = tags.split(',').map(t => t.trim().toLowerCase());
      scored = scored.filter(({ s }) => (s.tags || []).some(t => need.includes(t.toLowerCase())));
    }
    if (exclude_tags) {
      const ban = exclude_tags.split(',').map(t => t.trim().toLowerCase());
      scored = scored.filter(({ s }) => !(s.tags || []).some(t => ban.includes(t.toLowerCase())));
    }

    // Video filter (static data has no videos, so filter all if requested)
    if (typeof has_video !== 'undefined') {
      const hv = String(has_video).toLowerCase();
      const want = hv === 'true' || hv === '1' || hv === 'yes';
      if (want) {
        scored = scored.filter(({ s }) => s.media?.video && Object.keys(s.media.video).length > 0);
      }
    }

    // Musical note filter (case-insensitive)
    if (note) {
      const noteLower = note.toLowerCase();
      scored = scored.filter(
        ({ s }) => s.analysis?.primary_note && s.analysis.primary_note.toLowerCase() === noteLower
      );
    }

    // Sorting
    const l = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
    const p = Math.max(1, parseInt(page, 10) || 1);

    const data = scored
      .sort((a, b) => {
        if (sort_by === 'intensity')
          return (b.s.audio?.intensity ?? 0) - (a.s.audio?.intensity ?? 0);
        if (sort_by === 'year') return (b.s.year ?? 0) - (a.s.year ?? 0);
        if (sort_by === 'duration') return (b.s.audio?.duration ?? 0) - (a.s.audio?.duration ?? 0);
        // relevance (default)
        if (b.score === a.score) return (b.s.remix_count ?? 0) - (a.s.remix_count ?? 0);
        return b.score - a.score;
      })
      .map(({ s }) => s)
      .filter(s => s.approved !== false);

    const total = data.length;
    const start = (p - 1) * l;
    const end = start + l;
    const items = data.slice(start, end);

    return { page: p, limit: l, total, items };
  }
}

module.exports = SearchService;
