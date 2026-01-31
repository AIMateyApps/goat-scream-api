/**
 * Parsing utilities for request data transformation.
 * Provides consistent parsing for booleans, tags, and other common formats.
 */

/**
 * Parse a value to boolean.
 * Handles string representations like 'true', '1', 'yes', 'y'.
 *
 * @param {*} value - Value to parse
 * @returns {boolean} Parsed boolean value
 */
function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return ['true', '1', 'yes', 'y'].includes(v);
  }
  return false;
}

/**
 * Parse a value to an array of tags.
 * Handles comma or pipe-delimited strings and arrays.
 *
 * @param {*} value - Value to parse (string, array, or null/undefined)
 * @param {string[]} [fallback=[]] - Default value if input is empty
 * @returns {string[]} Array of trimmed, non-empty tag strings
 */
function parseTags(value, fallback = []) {
  if (!value) return [...fallback];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(/[,|]/)
    .map(token => token.trim())
    .filter(Boolean);
}

module.exports = {
  parseBool,
  parseTags,
};
