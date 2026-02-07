function tokenize(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function inText(hay, needles) {
  const bag = new Set(tokenize(hay));
  const tokenizedNeedles = needles.map(n => tokenize(n)).flat();
  return tokenizedNeedles.some(n => bag.has(n));
}

function parseRange(r) {
  if (!r) return null;
  const parts = r.split('-');
  if (parts.length === 1) {
    const val = parseFloat(parts[0]);
    // Always return object, even if invalid (test expects { min: null, max: null })
    return { min: Number.isFinite(val) ? val : null, max: null };
  }
  if (parts.length === 2) {
    const a = parts[0] ? parseFloat(parts[0]) : null;
    const b = parts[1] ? parseFloat(parts[1]) : null;
    // Always return object, even if both parts invalid (test expects { min: null, max: null })
    return { min: Number.isFinite(a) ? a : null, max: Number.isFinite(b) ? b : null };
  }
  // Handle cases like '-5--1' which splits to ['', '5', '', '1']
  if (parts.length === 4 && parts[0] === '' && parts[2] === '') {
    const a = parseFloat(`-${parts[1]}`);
    const b = parseFloat(`-${parts[3]}`);
    return { min: Number.isFinite(a) ? a : null, max: Number.isFinite(b) ? b : null };
  }
  // Fallback: try to parse first and last parts
  const first = parts[0] ? parseFloat(parts[0]) : null;
  const last = parts[parts.length - 1] ? parseFloat(parts[parts.length - 1]) : null;
  // Always return object format for consistency
  return { min: Number.isFinite(first) ? first : null, max: Number.isFinite(last) ? last : null };
}

module.exports = {
  tokenize,
  inText,
  parseRange,
};
