const BaseRepository = require('./baseRepository');
const { getStaticScreams } = require('../utils/staticScreams');
const { clone, applyFilters, deepGet } = require('../utils/filters');

/**
 * Static data implementation of screams repository
 * Uses in-memory static dataset as fallback when MongoDB is unavailable
 */
class StaticScreamsRepository extends BaseRepository {
  /**
   * Find documents matching filter
   * @param {Object} filter - Query filter (MongoDB-style, converted to in-memory filter)
   * @param {Object} options - Query options
   * @param {Object} options.sort - Sort specification
   * @param {number} options.skip - Number of documents to skip
   * @param {number} options.limit - Maximum number of documents to return
   * @param {Object} options.projection - Field projection (not used for static data)
   * @returns {Promise<Array>} Array of documents
   */
  async find(filter, options = {}) {
    const { sort, skip, limit } = options;
    let list = getStaticScreams();

    // Apply approval filter
    if (filter.approved !== false) {
      list = list.filter(s => s.approved !== false);
    }

    // Convert MongoDB filter to in-memory filter
    const query = this._mongoFilterToQuery(filter);
    list = applyFilters(list, query);

    // Sort
    if (sort) {
      const sortEntries = Object.entries(sort);
      list.sort((a, b) => {
        for (const [field, direction] of sortEntries) {
          const av = deepGet(a, field) ?? 0;
          const bv = deepGet(b, field) ?? 0;
          if (av !== bv) {
            return direction === 1 ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
          }
        }
        return 0;
      });
    }

    // Paginate
    if (skip !== undefined) {
      list = list.slice(skip);
    }
    if (limit !== undefined) {
      list = list.slice(0, limit);
    }

    // Clone to prevent mutations
    return list.map(clone);
  }

  /**
   * Find a single document by ID
   * @param {string} id - Document ID
   * @returns {Promise<Object|null>} Document or null if not found
   */
  async findById(id) {
    const list = getStaticScreams();
    const found = list.find(s => s.id === id && s.approved !== false);
    return found ? clone(found) : null;
  }

  /**
   * Find random documents matching filter
   * @param {Object} filter - Query filter
   * @param {number} limit - Number of random documents to return
   * @returns {Promise<Array>} Array of random documents
   */
  async findRandom(filter, limit) {
    let list = getStaticScreams();

    // Apply approval filter
    if (filter.approved !== false) {
      list = list.filter(s => s.approved !== false);
    }

    // Convert MongoDB filter to in-memory filter
    const query = this._mongoFilterToQuery(filter);
    list = applyFilters(list, query);

    // Random selection
    const pool = [...list];
    const picks = [];
    const n = Math.min(limit, pool.length);
    while (picks.length < n && pool.length) {
      const idx = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(idx, 1)[0]);
    }

    // Clone to prevent mutations
    return picks.map(clone);
  }

  /**
   * Count documents matching filter
   * @param {Object} filter - Query filter
   * @returns {Promise<number>} Count of matching documents
   */
  async count(filter) {
    let list = getStaticScreams();

    // Apply approval filter
    if (filter.approved !== false) {
      list = list.filter(s => s.approved !== false);
    }

    // Convert MongoDB filter to in-memory filter
    const query = this._mongoFilterToQuery(filter);
    list = applyFilters(list, query);

    return list.length;
  }

  /**
   * Run aggregation pipeline (limited support for static data)
   * @param {Array} pipeline - Aggregation pipeline
   * @returns {Promise<Array>} Aggregation results
   */
  async aggregate(pipeline) {
    let list = getStaticScreams();

    // Apply $match stages
    for (const stage of pipeline) {
      if (stage.$match) {
        const query = this._mongoFilterToQuery(stage.$match);
        list = applyFilters(list, query);
      } else if (stage.$group) {
        // Basic grouping support
        const groupId = stage.$group._id;
        const accumulators = stage.$group;
        const groups = {};

        list.forEach(doc => {
          // Get the grouping key
          let key;
          if (typeof groupId === 'string') {
            key = deepGet(doc, groupId);
          } else if (typeof groupId === 'object' && groupId.$toLower) {
            // Handle $toLower: '$tags'
            const field = groupId.$toLower.replace(/^\$/, '');
            const value = deepGet(doc, field);
            key = value ? String(value).toLowerCase() : null;
          } else {
            key = groupId;
          }

          if (key === null || key === undefined) return;

          if (!groups[key]) {
            groups[key] = { _id: key };
            // Initialize accumulator fields with their names
            Object.keys(accumulators).forEach(accKey => {
              if (accKey !== '_id') {
                const acc = accumulators[accKey];
                if (acc.$sum) {
                  groups[key][accKey] = 0;
                } else if (acc.$first) {
                  const field = acc.$first.replace(/^\$/, '');
                  groups[key][accKey] = deepGet(doc, field);
                }
              }
            });
          }

          // Accumulate values
          Object.keys(accumulators).forEach(accKey => {
            if (accKey !== '_id') {
              const acc = accumulators[accKey];
              if (acc.$sum) {
                // Increment by the sum value (usually 1 for counting)
                groups[key][accKey] += acc.$sum === 1 ? 1 : acc.$sum || 1;
              }
              // $first doesn't need accumulation, it's already set on first doc
            }
          });
        });

        list = Object.values(groups);
      } else if (stage.$sort) {
        const sortEntries = Object.entries(stage.$sort);
        list.sort((a, b) => {
          for (const [field, direction] of sortEntries) {
            const av = deepGet(a, field) ?? 0;
            const bv = deepGet(b, field) ?? 0;
            if (av !== bv) {
              return direction === 1 ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
            }
          }
          return 0;
        });
      } else if (stage.$limit) {
        list = list.slice(0, stage.$limit);
      } else if (stage.$unwind) {
        const field = stage.$unwind.replace(/^\$/, '');
        const unwound = [];
        list.forEach(doc => {
          const arr = deepGet(doc, field);
          if (Array.isArray(arr)) {
            arr.forEach(item => {
              unwound.push({ ...doc, [field]: item });
            });
          }
        });
        list = unwound;
      }
    }

    return list;
  }

  /**
   * Get distinct values for a field
   * @param {string} field - Field path (e.g., 'goat.breed')
   * @param {Object} filter - Query filter
   * @returns {Promise<Array>} Array of distinct values
   */
  async distinct(field, filter) {
    let list = getStaticScreams();

    // Apply approval filter
    if (filter && filter.approved !== false) {
      list = list.filter(s => s.approved !== false);
    }

    // Convert MongoDB filter to in-memory filter
    if (filter) {
      const query = this._mongoFilterToQuery(filter);
      list = applyFilters(list, query);
    }

    const values = new Set();
    list.forEach(doc => {
      const value = deepGet(doc, field);
      if (value != null && value !== '') {
        values.add(value);
      }
    });

    return Array.from(values);
  }

  /**
   * Update a document (not supported for static data - would need separate stats store)
   * @param {Object} filter - Query filter
   * @param {Object} update - Update operations
   * @returns {Promise<Object>} Update result (mock)
   */
  async updateOne(_filter, _update) {
    // Static data is immutable - updates would need to go to a separate stats store
    // For now, return a mock result
    return {
      acknowledged: true,
      modifiedCount: 0,
      upsertedId: null,
      upsertedCount: 0,
      matchedCount: 0,
    };
  }

  /**
   * Convert MongoDB filter to query object for in-memory filtering
   * @private
   * @param {Object} filter - MongoDB filter
   * @returns {Object} Query object compatible with applyFilters
   */
  _mongoFilterToQuery(filter) {
    const query = {};

    if (filter['audio.intensity']) {
      const intensity = filter['audio.intensity'];
      if (intensity.$gte !== undefined) query.intensity_min = intensity.$gte.toString();
      if (intensity.$lte !== undefined) query.intensity_max = intensity.$lte.toString();
    }

    if (filter.year !== undefined) {
      query.year = filter.year.toString();
    }

    if (filter.source_type) {
      query.source_type = filter.source_type;
    }

    if (filter.meme_status) {
      query.meme_status = filter.meme_status;
    }

    if (filter['goat.breed']) {
      if (filter['goat.breed'].$regex) {
        query.breed = filter['goat.breed'].$regex;
      } else {
        query.breed = filter['goat.breed'];
      }
    }

    if (filter['audio.category']) {
      query.category = filter['audio.category'];
    }

    return query;
  }
}

module.exports = StaticScreamsRepository;
