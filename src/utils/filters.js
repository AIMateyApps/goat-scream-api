function clone(obj) {
  if (obj === null || obj === undefined) return obj;
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Escape special regex characters in a string to prevent ReDoS attacks.
 * @param {string} str - User input to escape
 * @returns {string} Escaped string safe for use in RegExp
 */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return fallback;
}

function applyFilters(list, query) {
  const { intensity_min, intensity_max, year, source_type, meme_status, breed, category, note } =
    query;

  let filtered = list;

  if (intensity_min || intensity_max) {
    filtered = filtered.filter(s => {
      const i = s.audio?.intensity ?? 0;
      if (intensity_min && i < parseInt(intensity_min, 10)) return false;
      if (intensity_max && i > parseInt(intensity_max, 10)) return false;
      return true;
    });
  }

  if (year) {
    const y = parseInt(year, 10);
    filtered = filtered.filter(s => s.year === y);
  }

  if (source_type) {
    filtered = filtered.filter(s => s.source_type === source_type);
  }

  if (meme_status) {
    filtered = filtered.filter(s => s.meme_status === meme_status);
  }

  if (breed) {
    const re = new RegExp(escapeRegex(breed), 'i');
    filtered = filtered.filter(s => re.test(s.goat?.breed || ''));
  }

  if (category) {
    filtered = filtered.filter(s => s.audio?.category === category);
  }

  // Musical note filter (case-insensitive)
  if (note) {
    const noteLower = note.toLowerCase();
    filtered = filtered.filter(
      s => s.analysis?.primary_note && s.analysis.primary_note.toLowerCase() === noteLower
    );
  }

  return filtered;
}

function buildMongoFilter(query, { includeUnapproved = false } = {}) {
  const { intensity_min, intensity_max, year, source_type, meme_status, breed, category, note } =
    query;

  const filter = {};

  if (!includeUnapproved) {
    filter.approved = true;
  }

  if (intensity_min || intensity_max) {
    const min = parseInt(intensity_min, 10);
    const max = parseInt(intensity_max, 10);
    if (!Number.isNaN(min) || !Number.isNaN(max)) {
      filter['audio.intensity'] = {};
      if (!Number.isNaN(min)) filter['audio.intensity'].$gte = min;
      if (!Number.isNaN(max)) filter['audio.intensity'].$lte = max;
      if (Object.keys(filter['audio.intensity']).length === 0) {
        delete filter['audio.intensity'];
      }
    }
  }

  if (year) {
    const y = parseInt(year, 10);
    if (!Number.isNaN(y)) {
      filter.year = y;
    }
  }

  if (source_type) {
    filter.source_type = source_type;
  }

  if (meme_status) {
    filter.meme_status = meme_status;
  }

  if (breed) {
    filter['goat.breed'] = { $regex: escapeRegex(breed), $options: 'i' };
  }

  if (category) {
    filter['audio.category'] = category;
  }

  // Musical note filter (case-insensitive)
  if (note) {
    filter['analysis.primary_note'] = { $regex: `^${escapeRegex(note)}$`, $options: 'i' };
  }

  return filter;
}

function deepGet(obj, path) {
  return path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj);
}

module.exports = {
  clone,
  escapeRegex,
  parseBoolean,
  applyFilters,
  buildMongoFilter,
  deepGet,
};
