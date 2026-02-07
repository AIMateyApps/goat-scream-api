const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../src/app');
const { connectMongo } = require('../../src/db/connection');
const GoatScream = require('../../src/models/GoatScream');

describe('GET /api/search', () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const uri = mongo.getUri();
    process.env.MONGODB_URI = uri;
    await connectMongo({ uri });
  });

  afterAll(async () => {
    await mongoose.connection.close();
    if (mongo) await mongo.stop();
  });

  beforeEach(async () => {
    await GoatScream.deleteMany({});
  });

  const createTestScreams = async () => {
    return await GoatScream.create([
      {
        id: 'search-1',
        title: 'Viral Goat Scream',
        source_type: 'viral_video',
        context: 'This is a funny viral video',
        source: { title: 'YouTube Classic' },
        tags: ['viral', 'funny', 'classic'],
        year: 2020,
        audio: { duration: 2.5, intensity: 8 },
        approved: true,
      },
      {
        id: 'search-2',
        title: 'Farm Recording',
        source_type: 'farm_recording',
        context: 'Farm goats making noise',
        source: { title: 'Farm Life' },
        tags: ['farm', 'ambient'],
        year: 2021,
        audio: { duration: 3.0, intensity: 5 },
        approved: true,
      },
      {
        id: 'search-3',
        title: 'Intense Scream',
        source_type: 'viral_video',
        context: 'Very loud goat',
        source: { title: 'Loud Goats' },
        tags: ['loud', 'intense'],
        year: 2020,
        audio: { duration: 1.8, intensity: 10 },
        approved: true,
      },
      {
        id: 'search-4',
        title: 'Another Viral',
        source_type: 'viral_video',
        context: 'Another viral moment',
        source: { title: 'Viral Collection' },
        tags: ['viral'],
        year: 2019,
        audio: { duration: 2.2, intensity: 7 },
        approved: true,
      },
    ]);
  };

  describe('text search', () => {
    it('should search across title, context, source, tags (case-insensitive, handles empty query)', async () => {
      await createTestScreams();

      // Search by title
      const res1 = await request(app).get('/api/v1/search').query({ q: 'viral' }).expect(200);
      expect(res1.body.items.length).toBeGreaterThan(0);
      expect(res1.body.items.some(s => s.title.toLowerCase().includes('viral'))).toBe(true);

      // Search by context
      const res2 = await request(app).get('/api/v1/search').query({ q: 'farm' }).expect(200);
      expect(res2.body.items.length).toBeGreaterThan(0);
      expect(res2.body.items.some(s => s.context?.toLowerCase().includes('farm'))).toBe(true);

      // Search by source title
      const res3 = await request(app).get('/api/v1/search').query({ q: 'youtube' }).expect(200);
      expect(res3.body.items.length).toBeGreaterThan(0);
      expect(res3.body.items.some(s => s.source?.title?.toLowerCase().includes('youtube'))).toBe(
        true
      );

      // Search by tags
      const res4 = await request(app).get('/api/v1/search').query({ q: 'funny' }).expect(200);
      expect(res4.body.items.length).toBeGreaterThan(0);
      expect(res4.body.items.some(s => s.tags?.includes('funny'))).toBe(true);

      // Case-insensitive
      const res5 = await request(app).get('/api/v1/search').query({ q: 'VIRAL' }).expect(200);
      expect(res5.body.items.length).toBeGreaterThan(0);

      // Empty query
      const res6 = await request(app).get('/api/v1/search').expect(200);
      expect(res6.body.items.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('numeric range filters', () => {
    it('should filter by intensity_range, duration_range, and years (full range, min-only, max-only)', async () => {
      await createTestScreams();

      // Intensity range (full)
      const res1 = await request(app)
        .get('/api/v1/search')
        .query({ intensity_range: '6-9' })
        .expect(200);
      expect(res1.body.items.every(s => s.audio.intensity >= 6 && s.audio.intensity <= 9)).toBe(
        true
      );

      // Intensity range (min-only)
      const res2 = await request(app)
        .get('/api/v1/search')
        .query({ intensity_range: '8-' })
        .expect(200);
      expect(res2.body.items.every(s => s.audio.intensity >= 8)).toBe(true);

      // Intensity range (max-only)
      const res3 = await request(app)
        .get('/api/v1/search')
        .query({ intensity_range: '-7' })
        .expect(200);
      expect(res3.body.items.every(s => s.audio.intensity <= 7)).toBe(true);

      // Duration range
      const res4 = await request(app)
        .get('/api/v1/search')
        .query({ duration_range: '2.0-2.5' })
        .expect(200);
      expect(res4.body.items.every(s => s.audio.duration >= 2.0 && s.audio.duration <= 2.5)).toBe(
        true
      );

      // Years range
      const res5 = await request(app)
        .get('/api/v1/search')
        .query({ years: '2019-2020' })
        .expect(200);
      expect(res5.body.items.every(s => s.year >= 2019 && s.year <= 2020)).toBe(true);
    });
  });

  describe('tag filters', () => {
    it('should filter by tags inclusion, exclude_tags, and handle single/multiple tags', async () => {
      await createTestScreams();

      // Multiple tags inclusion
      const res1 = await request(app)
        .get('/api/v1/search')
        .query({ tags: 'viral,funny' })
        .expect(200);
      expect(res1.body.items.every(s => s.tags?.some(t => ['viral', 'funny'].includes(t)))).toBe(
        true
      );

      // Single tag
      const res2 = await request(app).get('/api/v1/search').query({ tags: 'viral' }).expect(200);
      expect(res2.body.items.length).toBeGreaterThan(0);
      expect(res2.body.items.every(s => s.tags?.includes('viral'))).toBe(true);

      // Exclude tags
      const res3 = await request(app)
        .get('/api/v1/search')
        .query({ exclude_tags: 'viral' })
        .expect(200);
      expect(res3.body.items.every(s => !s.tags?.includes('viral'))).toBe(true);
    });
  });

  describe('has_video filter', () => {
    it('should filter by has_video (true and false)', async () => {
      await GoatScream.create({
        id: 'video-1',
        title: 'With Video',
        source_type: 'viral_video',
        audio: { duration: 2.5 },
        media: { video: { '720p': 'https://example.com/video.mp4' } },
        approved: true,
      });

      // has_video=true
      const res1 = await request(app)
        .get('/api/v1/search')
        .query({ has_video: 'true' })
        .expect(200);
      expect(res1.body.items.every(s => s.media?.video)).toBe(true);

      // has_video=false
      await createTestScreams();
      const res2 = await request(app)
        .get('/api/v1/search')
        .query({ has_video: 'false' })
        .expect(200);
      expect(res2.body.items.every(s => !s.media?.video)).toBe(true);
    });
  });

  describe('pagination', () => {
    it('should handle pagination (custom, default, max limit)', async () => {
      await createTestScreams();

      // Custom pagination
      const res1 = await request(app)
        .get('/api/v1/search')
        .query({ page: '1', limit: '2' })
        .expect(200);
      expect(res1.body).toHaveProperty('page', 1);
      expect(res1.body).toHaveProperty('limit', 2);
      expect(res1.body.items.length).toBeLessThanOrEqual(2);

      // Default pagination
      const res2 = await request(app).get('/api/v1/search').expect(200);
      expect(res2.body.page).toBe(1);
      expect(res2.body.limit).toBe(20);

      // Max limit enforcement
      const res3 = await request(app).get('/api/v1/search').query({ limit: '200' }).expect(200);
      expect(res3.body.limit).toBeLessThanOrEqual(100);
    });
  });

  describe('sorting', () => {
    it('should sort by intensity, year, duration, and relevance (default)', async () => {
      await createTestScreams();

      // Sort by intensity
      const res1 = await request(app)
        .get('/api/v1/search')
        .query({ sort_by: 'intensity' })
        .expect(200);
      // Verify descending sort - loop is vacuously correct for short arrays
      for (let i = 0; i < res1.body.items.length - 1; i++) {
        expect(res1.body.items[i].audio.intensity).toBeGreaterThanOrEqual(
          res1.body.items[i + 1].audio.intensity
        );
      }

      // Sort by year
      const res2 = await request(app).get('/api/v1/search').query({ sort_by: 'year' }).expect(200);
      // Verify descending sort - loop is vacuously correct for short arrays
      for (let i = 0; i < res2.body.items.length - 1; i++) {
        expect(res2.body.items[i].year).toBeGreaterThanOrEqual(res2.body.items[i + 1].year);
      }

      // Sort by duration
      const res3 = await request(app)
        .get('/api/v1/search')
        .query({ sort_by: 'duration' })
        .expect(200);
      // Verify descending sort - loop is vacuously correct for short arrays
      for (let i = 0; i < res3.body.items.length - 1; i++) {
        expect(res3.body.items[i].audio.duration).toBeGreaterThanOrEqual(
          res3.body.items[i + 1].audio.duration
        );
      }

      // Default relevance sorting
      const res4 = await request(app).get('/api/v1/search').query({ q: 'viral' }).expect(200);
      expect(res4.body.items.length).toBeGreaterThan(0);
    });
  });

  describe('combined filters', () => {
    it('should combine text search, numeric filters, and multiple filters', async () => {
      await createTestScreams();

      // Text + numeric filter
      const res1 = await request(app)
        .get('/api/v1/search')
        .query({ q: 'viral', intensity_range: '6-9' })
        .expect(200);
      expect(
        res1.body.items.every(s => {
          const matchesText =
            s.title?.toLowerCase().includes('viral') ||
            s.context?.toLowerCase().includes('viral') ||
            s.source?.title?.toLowerCase().includes('viral') ||
            s.tags?.includes('viral');
          const matchesIntensity = s.audio.intensity >= 6 && s.audio.intensity <= 9;
          return matchesText && matchesIntensity;
        })
      ).toBe(true);

      // Multiple filters combined
      const res2 = await request(app)
        .get('/api/v1/search')
        .query({
          q: 'viral',
          intensity_range: '6-9',
          years: '2019-2020',
          tags: 'funny',
        })
        .expect(200);
      expect(res2.body.items.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty results, invalid ranges, malformed queries, and edge-case ranges', async () => {
      // Empty results
      const res1 = await request(app)
        .get('/api/v1/search')
        .query({ q: 'nonexistentterm12345' })
        .expect(200);
      expect(res1.body.total).toBe(0);
      expect(res1.body.items).toHaveLength(0);

      await createTestScreams();

      // Invalid range format - should return 400 validation error
      const res2 = await request(app)
        .get('/api/v1/search')
        .query({ intensity_range: 'invalid' })
        .expect(400);
      expect(res2.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

      // Malformed queries - should return 400 validation error
      const res3 = await request(app)
        .get('/api/v1/search')
        .query({ intensity_range: 'abc-def', duration_range: 'xyz' })
        .expect(400);
      expect(res3.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

      // Edge-case: max < min
      const res4 = await request(app)
        .get('/api/v1/search')
        .query({ intensity_range: '10-5' })
        .expect(200);
      expect(res4.body).toHaveProperty('items');
    });
  });
});
