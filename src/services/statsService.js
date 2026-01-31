const { getScreamsRepository } = require('../repositories');
const { getStaticScreams } = require('../utils/staticScreams');
const { getDbStatus } = require('../db/connection');
const cache = require('./cache');

/**
 * Service layer for stats operations
 * Handles aggregation and statistics calculations
 */
class StatsService {
  constructor(repository = null) {
    // Allow injection for testing, otherwise get dynamically
    this._repository = repository;
  }

  get repository() {
    // Get repository dynamically based on current DB status
    return this._repository || getScreamsRepository();
  }

  /**
   * Get comprehensive statistics
   * @returns {Promise<Object>} Statistics object with totals, distributions, and top tags
   */
  async getStats() {
    // Check cache for stats (300s TTL - 5 minutes)
    const cacheKey = 'stats:summary';
    const cached = await cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const db = getDbStatus();
    const stats = db.connected ? await this._getStatsMongo() : await this._getStatsStatic();

    // Cache result (300s TTL)
    await cache.set(cacheKey, stats, 300);

    return stats;
  }

  /**
   * Get stats from MongoDB
   * @private
   */
  async _getStatsMongo() {
    const total = await this.repository.count({ approved: true });

    const [byYearAgg, bySourceAgg, intensityAgg, tagsAgg] = await Promise.all([
      this.repository.aggregate([
        { $match: { approved: true } },
        { $group: { _id: '$year', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      this.repository.aggregate([
        { $match: { approved: true } },
        { $group: { _id: '$source_type', count: { $sum: 1 } } },
      ]),
      this.repository.aggregate([
        { $match: { approved: true } },
        { $group: { _id: '$audio.intensity', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      this.repository.aggregate([
        { $match: { approved: true } },
        { $unwind: '$tags' },
        { $group: { _id: { $toLower: '$tags' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const by_year = {};
    byYearAgg.forEach(d => {
      if (d._id != null) by_year[d._id] = d.count;
    });

    const by_source_type = {};
    bySourceAgg.forEach(d => {
      if (d._id) by_source_type[d._id] = d.count;
    });

    const intensity_distribution = Array.from({ length: 10 }, () => 0);
    intensityAgg.forEach(d => {
      const i = Math.min(10, Math.max(1, d._id || 0));
      intensity_distribution[i - 1] += d.count;
    });

    const top_tags = tagsAgg.map(d => ({ tag: d._id, count: d.count }));

    return {
      total_screams: total,
      by_year,
      by_source_type,
      intensity_distribution,
      top_tags,
    };
  }

  /**
   * Get stats from static data
   * @private
   */
  async _getStatsStatic() {
    const staticScreams = getStaticScreams();
    const total = staticScreams.length;

    const byYear = {};
    const bySourceType = {};
    const intensityDist = Array.from({ length: 10 }, () => 0); // 1..10
    const tagCounts = {};

    staticScreams.forEach(s => {
      byYear[s.year] = (byYear[s.year] || 0) + 1;
      bySourceType[s.source_type] = (bySourceType[s.source_type] || 0) + 1;
      const i = Math.min(10, Math.max(1, s.audio?.intensity ?? 0));
      intensityDist[i - 1] += 1;
      (s.tags || []).forEach(t => {
        const key = t.toLowerCase();
        tagCounts[key] = (tagCounts[key] || 0) + 1;
      });
    });

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return {
      total_screams: total,
      by_year: byYear,
      by_source_type: bySourceType,
      intensity_distribution: intensityDist,
      top_tags: topTags,
    };
  }
}

module.exports = StatsService;
