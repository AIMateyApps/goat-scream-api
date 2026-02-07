const { tokenize, inText, parseRange } = require('../../src/utils/search');

describe('search utilities', () => {
  describe('tokenize', () => {
    it('should split string into lowercase tokens and filter non-alphanumeric', () => {
      expect(tokenize('Hello World Test')).toEqual(['hello', 'world', 'test']);
      expect(tokenize('Hello, World! Test-123')).toEqual(['hello', 'world', 'test', '123']);
      expect(tokenize('GoAt ScReAm')).toEqual(['goat', 'scream']);
    });

    it('should handle numbers and mixed content', () => {
      expect(tokenize('Goat 123 Scream')).toEqual(['goat', '123', 'scream']);
      expect(tokenize(123)).toEqual(['123']);
      expect(tokenize(true)).toEqual(['true']);
    });

    it('should return empty array for null/undefined/empty/whitespace/special-only strings', () => {
      expect(tokenize('')).toEqual([]);
      expect(tokenize(null)).toEqual([]);
      expect(tokenize(undefined)).toEqual([]);
      expect(tokenize('   ')).toEqual([]);
      expect(tokenize('!!!@@@###')).toEqual([]);
    });
  });

  describe('inText', () => {
    it('should find needles in haystack (case-insensitive, partial matches, special chars)', () => {
      expect(inText('Hello World', ['hello'])).toBe(true);
      expect(inText('Hello World', ['world'])).toBe(true);
      expect(inText('Hello World', ['test'])).toBe(false);
      expect(inText('Hello World', ['hello', 'test'])).toBe(true);
      expect(inText('Hello World', ['HELLO'])).toBe(true);
      expect(inText('HELLO WORLD', ['hello'])).toBe(true);
      expect(inText('goat scream', ['goat'])).toBe(true);
      expect(inText('Hello, World!', ['hello'])).toBe(true);
      expect(inText('Hello-World', ['hello'])).toBe(true);
    });

    it('should handle numbers and edge cases', () => {
      expect(inText('Goat 123 Scream', ['123'])).toBe(true);
      expect(inText('Goat 123 Scream', ['456'])).toBe(false);
      expect(inText('', ['test'])).toBe(false);
      expect(inText('Hello World', [])).toBe(false);
      expect(inText(null, ['test'])).toBe(false);
    });
  });

  describe('parseRange', () => {
    it('should parse valid ranges (full, partial, decimals, negatives, single value)', () => {
      expect(parseRange('5-10')).toEqual({ min: 5, max: 10 });
      expect(parseRange('5.5-10.7')).toEqual({ min: 5.5, max: 10.7 });
      expect(parseRange('5-')).toEqual({ min: 5, max: null });
      expect(parseRange('-10')).toEqual({ min: null, max: 10 });
      expect(parseRange('5')).toEqual({ min: 5, max: null });
      expect(parseRange('-5--1')).toEqual({ min: -5, max: -1 });
    });

    it('should handle invalid/edge cases (null/undefined/empty/invalid format/mixed)', () => {
      expect(parseRange('')).toBeNull();
      expect(parseRange(null)).toBeNull();
      expect(parseRange(undefined)).toBeNull();
      expect(parseRange('invalid')).toEqual({ min: null, max: null });
      expect(parseRange('abc-def')).toEqual({ min: null, max: null });
      expect(parseRange('5-abc')).toEqual({ min: 5, max: null });
      expect(parseRange('abc-10')).toEqual({ min: null, max: 10 });
    });
  });
});
