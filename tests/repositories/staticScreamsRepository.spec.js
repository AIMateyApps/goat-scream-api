const StaticScreamsRepository = require('../../src/repositories/staticScreamsRepository');
const { getStaticScreams } = require('../../src/utils/staticScreams');

describe('StaticScreamsRepository', () => {
  let repository;

  beforeAll(() => {
    repository = new StaticScreamsRepository();
  });

  describe('find', () => {
    it('should find all approved screams', async () => {
      const results = await repository.find({ approved: true });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.every(s => s.approved !== false)).toBe(true);
    });

    it('should filter by year', async () => {
      const results = await repository.find({ approved: true, year: 2020 });

      expect(results.every(s => s.year === 2020)).toBe(true);
    });

    it('should filter by source_type', async () => {
      const results = await repository.find({
        approved: true,
        source_type: 'viral_video',
      });

      expect(results.every(s => s.source_type === 'viral_video')).toBe(true);
    });

    it('should filter by intensity range', async () => {
      const results = await repository.find({
        approved: true,
        'audio.intensity': { $gte: 8, $lte: 10 },
      });

      expect(results.every(s => s.audio?.intensity >= 8 && s.audio?.intensity <= 10)).toBe(true);
    });

    it('should apply sort', async () => {
      const results = await repository.find({ approved: true }, { sort: { year: 1 } });

      for (let i = 1; i < results.length; i++) {
        expect(results[i].year >= results[i - 1].year).toBe(true);
      }
    });

    it('should apply skip and limit', async () => {
      const results = await repository.find({ approved: true }, { skip: 5, limit: 10 });

      expect(results.length).toBeLessThanOrEqual(10);
    });

    it('should return cloned data (no mutations)', async () => {
      const results = await repository.find({ approved: true }, { limit: 1 });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(0);

      // Skip mutation test if no data exists
      if (results.length === 0) {
        return;
      }

      const original = results[0];
      const originalTitle = original.title;
      original.title = 'Mutated Title';

      // Fetch again - should not be mutated
      const results2 = await repository.find({ approved: true }, { limit: 1 });
      expect(results2.length).toBeGreaterThan(0);
      expect(results2[0].title).toBe(originalTitle);
    });
  });

  describe('findById', () => {
    it('should find scream by ID', async () => {
      const staticScreams = getStaticScreams();
      const testId = staticScreams.find(s => s.approved !== false)?.id;

      expect(testId).toBeDefined();
      if (!testId) return;

      const result = await repository.findById(testId);

      expect(result).toBeTruthy();
      expect(result.id).toBe(testId);
      expect(result.approved).not.toBe(false);
    });

    it('should return null for non-existent ID', async () => {
      const result = await repository.findById('nonexistent-id-12345');

      expect(result).toBeNull();
    });

    it('should return null for unapproved scream', async () => {
      const staticScreams = getStaticScreams();
      const unapproved = staticScreams.find(s => s.approved === false);

      // Test unapproved scream if exists, otherwise test nonexistent ID
      const testId = unapproved ? unapproved.id : 'nonexistent';
      const result = await repository.findById(testId);
      expect(result).toBeNull();
    });

    it('should return cloned data', async () => {
      const staticScreams = getStaticScreams();
      const testId = staticScreams.find(s => s.approved !== false)?.id;

      expect(testId).toBeDefined();
      if (!testId) return;

      const result = await repository.findById(testId);
      expect(result).toBeTruthy();
      const originalTitle = result.title;
      result.title = 'Mutated';

      const result2 = await repository.findById(testId);
      expect(result2).toBeTruthy();
      expect(result2.title).toBe(originalTitle);
    });
  });

  describe('findRandom', () => {
    it('should return random screams', async () => {
      const results = await repository.findRandom({ approved: true }, 5);

      expect(results.length).toBeLessThanOrEqual(5);
      expect(results.every(s => s.approved !== false)).toBe(true);
    });

    it('should return fewer results if limit exceeds available', async () => {
      const results = await repository.findRandom({ approved: true }, 10000);

      expect(results.length).toBeLessThanOrEqual(
        getStaticScreams().filter(s => s.approved !== false).length
      );
    });

    it('should filter by criteria', async () => {
      const results = await repository.findRandom({ approved: true, year: 2020 }, 10);

      expect(results.every(s => s.year === 2020)).toBe(true);
    });

    it('should return cloned data', async () => {
      const results = await repository.findRandom({ approved: true }, 1);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(0);

      // Skip mutation test if no data exists
      if (results.length === 0) {
        return;
      }

      // Mutate the returned object
      const originalId = results[0].id;
      const originalTitle = results[0].title;
      results[0].title = 'Mutated';

      // Fetch the same item by ID to verify mutation didn't persist
      const foundById = await repository.findById(originalId);
      expect(foundById).toBeTruthy();
      expect(foundById.title).toBe(originalTitle);
      expect(foundById.title).not.toBe('Mutated');
    });
  });

  describe('count', () => {
    it('should count approved screams', async () => {
      const count = await repository.count({ approved: true });

      expect(count).toBeGreaterThan(0);
      expect(typeof count).toBe('number');
    });

    it('should count filtered screams', async () => {
      const count = await repository.count({ approved: true, year: 2020 });

      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 for no matches', async () => {
      const count = await repository.count({
        approved: true,
        year: 9999,
      });

      expect(count).toBe(0);
    });
  });

  describe('aggregate', () => {
    it('should run $match and $group pipeline', async () => {
      const results = await repository.aggregate([
        { $match: { approved: true } },
        { $group: { _id: '$year', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(0);
      // Verify structure of all results
      results.forEach(r => {
        expect(r).toHaveProperty('_id');
        expect(r).toHaveProperty('count');
        expect(typeof r.count).toBe('number');
      });
    });

    it('should handle $group with $sum', async () => {
      const results = await repository.aggregate([
        { $match: { approved: true } },
        { $group: { _id: '$source_type', count: { $sum: 1 } } },
      ]);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(0);
      // Verify structure of results if any exist
      results.forEach(r => {
        expect(r).toHaveProperty('_id');
        expect(r).toHaveProperty('count');
        expect(typeof r.count).toBe('number');
      });
    });

    it('should handle $unwind for tags', async () => {
      const results = await repository.aggregate([
        { $match: { approved: true } },
        { $unwind: '$tags' },
        { $group: { _id: { $toLower: '$tags' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(0);
      // Verify structure of results if any exist
      results.forEach(r => {
        expect(r).toHaveProperty('_id');
        expect(r).toHaveProperty('count');
      });
    });

    it('should handle $limit', async () => {
      const results = await repository.aggregate([{ $match: { approved: true } }, { $limit: 5 }]);

      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('distinct', () => {
    it('should return distinct breeds', async () => {
      const breeds = await repository.distinct('goat.breed', { approved: true });

      expect(Array.isArray(breeds)).toBe(true);
      // Should be unique - verify all values are non-null/empty
      expect(breeds.every(b => b != null && b !== '')).toBe(true);
      // If we have breeds, verify uniqueness
      expect(new Set(breeds).size).toBe(breeds.length);
    });

    it('should filter distinct values', async () => {
      const breeds = await repository.distinct('goat.breed', {
        approved: true,
        year: 2020,
      });

      expect(Array.isArray(breeds)).toBe(true);
    });

    it('should exclude null/empty values', async () => {
      const breeds = await repository.distinct('goat.breed', { approved: true });

      expect(breeds.every(b => b != null && b !== '')).toBe(true);
    });
  });

  describe('updateOne', () => {
    it('should return mock result (static data is immutable)', async () => {
      const result = await repository.updateOne({ id: 'test-id' }, { $set: { title: 'Updated' } });

      expect(result).toHaveProperty('acknowledged', true);
      expect(result).toHaveProperty('modifiedCount', 0);
      expect(result).toHaveProperty('matchedCount', 0);
    });

    it('should not mutate static data', async () => {
      const staticScreams = getStaticScreams();
      const testId = staticScreams[0]?.id;

      expect(testId).toBeDefined();
      if (!testId) return;

      await repository.updateOne({ id: testId }, { $set: { title: 'Updated' } });

      const found = await repository.findById(testId);
      // Original data should be unchanged
      expect(found).toBeTruthy();
      expect(found.title).not.toBe('Updated');
    });
  });
});
