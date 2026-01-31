const {
  clone,
  parseBoolean,
  applyFilters,
  buildMongoFilter,
  deepGet,
} = require('../../src/utils/filters');

describe('filters utilities', () => {
  describe('clone', () => {
    it('should create deep copies (objects, arrays) and preserve primitives/null/undefined', () => {
      // Deep copy objects
      const original = { a: 1, b: { c: 2 } };
      const cloned = clone(original);
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);

      // Deep copy arrays
      const arr = [1, 2, { a: 3 }];
      const clonedArr = clone(arr);
      expect(clonedArr).toEqual(arr);
      expect(clonedArr).not.toBe(arr);
      expect(clonedArr[2]).not.toBe(arr[2]);

      // Primitives and null/undefined
      expect(clone(42)).toBe(42);
      expect(clone('test')).toBe('test');
      expect(clone(true)).toBe(true);
      expect(clone(null)).toBeNull();
      expect(clone(undefined)).toBeUndefined();
    });
  });

  describe('parseBoolean', () => {
    it('should parse booleans, numbers, and strings (case-insensitive, whitespace-trimmed)', () => {
      // Booleans
      expect(parseBoolean(true)).toBe(true);
      expect(parseBoolean(false)).toBe(false);

      // Numbers (non-zero is true)
      expect(parseBoolean(1)).toBe(true);
      expect(parseBoolean(-1)).toBe(true);
      expect(parseBoolean(0)).toBe(false);
      expect(parseBoolean(42)).toBe(true);

      // Strings (case-insensitive, whitespace handled)
      expect(parseBoolean('true')).toBe(true);
      expect(parseBoolean('TRUE')).toBe(true);
      expect(parseBoolean('True')).toBe(true);
      expect(parseBoolean('  true  ')).toBe(true);
      expect(parseBoolean('1')).toBe(true);
      expect(parseBoolean('yes')).toBe(true);
      expect(parseBoolean('Y')).toBe(true);
      expect(parseBoolean('false')).toBe(false);
      expect(parseBoolean('FALSE')).toBe(false);
      expect(parseBoolean('  false  ')).toBe(false);
      expect(parseBoolean('0')).toBe(false);
      expect(parseBoolean('no')).toBe(false);
      expect(parseBoolean('N')).toBe(false);
    });

    it('should return fallback for undefined/null/invalid values', () => {
      // Undefined uses fallback (default false)
      expect(parseBoolean(undefined)).toBe(false);
      expect(parseBoolean(undefined, true)).toBe(true);
      expect(parseBoolean(undefined, false)).toBe(false);

      // Null uses fallback
      expect(parseBoolean(null)).toBe(false);
      expect(parseBoolean(null, true)).toBe(true);

      // Invalid strings use fallback
      expect(parseBoolean('invalid')).toBe(false);
      expect(parseBoolean('maybe')).toBe(false);
      expect(parseBoolean('invalid', true)).toBe(true);
    });
  });

  describe('applyFilters', () => {
    const mockScreams = [
      {
        id: '1',
        year: 2020,
        source_type: 'viral_video',
        meme_status: 'classic',
        goat: { breed: 'Alpine' },
        audio: { intensity: 8, category: 'short_burst' },
      },
      {
        id: '2',
        year: 2021,
        source_type: 'movie',
        meme_status: 'emerging',
        goat: { breed: 'Nubian' },
        audio: { intensity: 5, category: 'long_draw' },
      },
      {
        id: '3',
        year: 2020,
        source_type: 'viral_video',
        meme_status: 'classic',
        goat: { breed: 'Alpine' },
        audio: { intensity: 10, category: 'short_burst' },
      },
    ];

    it('should filter by all filter types and handle edge cases', () => {
      // No filters
      expect(applyFilters(mockScreams, {})).toHaveLength(3);

      // Intensity filters (min, max, range)
      expect(applyFilters(mockScreams, { intensity_min: '8' })).toHaveLength(2);
      expect(applyFilters(mockScreams, { intensity_max: '7' })).toHaveLength(1);
      const rangeResult = applyFilters(mockScreams, {
        intensity_min: '6',
        intensity_max: '9',
      });
      expect(rangeResult).toHaveLength(1);
      expect(rangeResult[0].audio.intensity).toBe(8);

      // Basic filters
      const yearResult = applyFilters(mockScreams, { year: '2020' });
      expect(yearResult).toHaveLength(2);
      expect(yearResult.every(s => s.year === 2020)).toBe(true);

      expect(applyFilters(mockScreams, { source_type: 'movie' })).toHaveLength(1);
      expect(applyFilters(mockScreams, { meme_status: 'classic' })).toHaveLength(2);
      expect(applyFilters(mockScreams, { category: 'short_burst' })).toHaveLength(2);

      // Case-insensitive breed filter
      const breedResult = applyFilters(mockScreams, { breed: 'alpine' });
      expect(breedResult).toHaveLength(2);
      expect(breedResult.every(s => s.goat.breed.toLowerCase() === 'alpine')).toBe(true);

      // Multiple filters combined
      const multiResult = applyFilters(mockScreams, {
        year: '2020',
        source_type: 'viral_video',
        intensity_min: '8',
      });
      expect(multiResult).toHaveLength(2);
      expect(
        multiResult.every(
          s => s.year === 2020 && s.source_type === 'viral_video' && s.audio.intensity >= 8
        )
      ).toBe(true);
    });

    it('should handle missing properties gracefully', () => {
      // Missing audio
      const screamsNoAudio = [
        { id: '1', audio: { intensity: 5 } },
        { id: '2' }, // no audio
        { id: '3', audio: { intensity: 8 } },
      ];
      const result1 = applyFilters(screamsNoAudio, { intensity_min: '6' });
      expect(result1).toHaveLength(1);
      expect(result1[0].id).toBe('3');

      // Missing goat/breed
      const screamsNoBreed = [
        { id: '1', goat: { breed: 'Alpine' } },
        { id: '2' }, // no goat
        { id: '3', goat: {} }, // no breed
      ];
      const result2 = applyFilters(screamsNoBreed, { breed: 'Alpine' });
      expect(result2).toHaveLength(1);
      expect(result2[0].id).toBe('1');
    });
  });

  describe('buildMongoFilter', () => {
    it('should build all filter types and handle approved flag', () => {
      // Approved filter (default)
      expect(buildMongoFilter({}).approved).toBe(true);
      expect(buildMongoFilter({}, { includeUnapproved: true }).approved).toBeUndefined();

      // Intensity filters (min, max, range, invalid handling)
      expect(buildMongoFilter({ intensity_min: '5' })['audio.intensity']).toEqual({ $gte: 5 });
      expect(buildMongoFilter({ intensity_max: '10' })['audio.intensity']).toEqual({ $lte: 10 });
      expect(
        buildMongoFilter({ intensity_min: '5', intensity_max: '10' })['audio.intensity']
      ).toEqual({ $gte: 5, $lte: 10 });
      expect(
        buildMongoFilter({
          intensity_min: 'invalid',
          intensity_max: 'also-invalid',
        })['audio.intensity']
      ).toBeUndefined();

      // Basic filters
      expect(buildMongoFilter({ year: '2020' }).year).toBe(2020);
      expect(buildMongoFilter({ year: 'invalid' }).year).toBeUndefined();
      expect(buildMongoFilter({ source_type: 'movie' }).source_type).toBe('movie');
      expect(buildMongoFilter({ meme_status: 'classic' }).meme_status).toBe('classic');
      expect(buildMongoFilter({ category: 'short_burst' })['audio.category']).toBe('short_burst');

      // Breed filter with regex
      expect(buildMongoFilter({ breed: 'Alpine' })['goat.breed']).toEqual({
        $regex: 'Alpine',
        $options: 'i',
      });

      // Combined filters
      const combined = buildMongoFilter({
        year: '2020',
        source_type: 'movie',
        intensity_min: '5',
        intensity_max: '10',
        breed: 'Alpine',
      });
      expect(combined.approved).toBe(true);
      expect(combined.year).toBe(2020);
      expect(combined.source_type).toBe('movie');
      expect(combined['audio.intensity']).toEqual({ $gte: 5, $lte: 10 });
      expect(combined['goat.breed']).toEqual({
        $regex: 'Alpine',
        $options: 'i',
      });
    });
  });

  describe('deepGet', () => {
    const obj = {
      a: {
        b: {
          c: 'value',
        },
      },
      x: 'direct',
    };

    it('should get nested/direct properties and handle edge cases', () => {
      // Valid paths
      expect(deepGet(obj, 'a.b.c')).toBe('value');
      expect(deepGet(obj, 'x')).toBe('direct');

      // Non-existent paths
      expect(deepGet(obj, 'a.b.d')).toBeUndefined();
      expect(deepGet(obj, 'nonexistent')).toBeUndefined();

      // Null/edge cases
      expect(deepGet(null, 'a.b')).toBeUndefined();
      expect(deepGet({ a: null }, 'a.b')).toBeUndefined();
      expect(deepGet(obj, '')).toBeUndefined();
    });
  });
});
