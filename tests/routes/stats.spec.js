const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../src/app');
const { connectMongo } = require('../../src/db/connection');
const GoatScream = require('../../src/models/GoatScream');

describe('GET /api/stats', () => {
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
    const baseDate = new Date('2020-01-01');
    return await GoatScream.create([
      {
        id: 'stats-1',
        title: 'Stats Scream 1',
        source_type: 'viral_video',
        year: 2020,
        date_added: new Date(baseDate.getTime()),
        audio: { duration: 2.5, intensity: 8 },
        tags: ['viral', 'funny'],
        approved: true,
      },
      {
        id: 'stats-2',
        title: 'Stats Scream 2',
        source_type: 'movie',
        year: 2021,
        date_added: new Date(baseDate.getTime() + 86400000),
        audio: { duration: 3.0, intensity: 5 },
        tags: ['movie', 'classic'],
        approved: true,
      },
      {
        id: 'stats-3',
        title: 'Stats Scream 3',
        source_type: 'viral_video',
        year: 2020,
        date_added: new Date(baseDate.getTime() + 172800000),
        audio: { duration: 1.8, intensity: 10 },
        tags: ['viral', 'intense'],
        approved: true,
      },
      {
        id: 'stats-4',
        title: 'Stats Scream 4',
        source_type: 'farm_recording',
        year: 2019,
        date_added: new Date(baseDate.getTime() + 259200000),
        audio: { duration: 2.2, intensity: 3 },
        tags: ['farm', 'viral'],
        approved: true,
      },
      {
        id: 'stats-unapproved',
        title: 'Unapproved Scream',
        source_type: 'user_submission',
        year: 2022,
        date_added: new Date(baseDate.getTime() + 345600000),
        audio: { duration: 2.0, intensity: 7 },
        tags: ['test'],
        approved: false,
      },
    ]);
  };

  describe('with MongoDB connected', () => {
    it('should return correct stats structure, totals, aggregations, intensity_distribution, and top_tags', async () => {
      await createTestScreams();
      const res = await request(app).get('/api/v1/stats').expect(200);

      // Structure
      expect(res.body).toHaveProperty('total_screams');
      expect(res.body).toHaveProperty('by_year');
      expect(res.body).toHaveProperty('by_source_type');
      expect(res.body).toHaveProperty('intensity_distribution');
      expect(res.body).toHaveProperty('top_tags');

      // Total count (only approved)
      expect(res.body.total_screams).toBe(4);

      // by_year aggregation
      expect(res.body.by_year).toHaveProperty('2020', 2);
      expect(res.body.by_year).toHaveProperty('2021', 1);
      expect(res.body.by_year).toHaveProperty('2019', 1);
      expect(res.body.by_year).not.toHaveProperty('2022'); // Unapproved

      // by_source_type aggregation
      expect(res.body.by_source_type).toHaveProperty('viral_video', 2);
      expect(res.body.by_source_type).toHaveProperty('movie', 1);
      expect(res.body.by_source_type).toHaveProperty('farm_recording', 1);

      // Intensity distribution (10 elements, all numbers, correct values)
      expect(Array.isArray(res.body.intensity_distribution)).toBe(true);
      expect(res.body.intensity_distribution.length).toBe(10);
      expect(res.body.intensity_distribution.every(val => typeof val === 'number')).toBe(true);
      const dist = res.body.intensity_distribution;
      expect(dist[7]).toBeGreaterThan(0); // intensity 8
      expect(dist[4]).toBeGreaterThan(0); // intensity 5
      expect(dist[9]).toBeGreaterThan(0); // intensity 10
      expect(dist[2]).toBeGreaterThan(0); // intensity 3

      // Top tags (array, max 10, sorted by count desc, includes viral)
      expect(Array.isArray(res.body.top_tags)).toBe(true);
      expect(res.body.top_tags.length).toBeLessThanOrEqual(10);
      // Verify descending sort - loop is vacuously correct for short arrays
      for (let i = 0; i < res.body.top_tags.length - 1; i++) {
        expect(res.body.top_tags[i].count).toBeGreaterThanOrEqual(res.body.top_tags[i + 1].count);
      }
      expect(res.body.top_tags.every(t => t.tag && typeof t.count === 'number')).toBe(true);
      const viralTag = res.body.top_tags.find(t => t.tag === 'viral');
      expect(viralTag).toBeDefined();
      expect(viralTag.count).toBeGreaterThanOrEqual(2); // Appears in at least 2 screams
    });

    it('should handle edge cases (empty dataset, no tags, null intensity, null year)', async () => {
      // Empty dataset
      const res1 = await request(app).get('/api/v1/stats').expect(200);
      expect(res1.body.total_screams).toBe(0);
      expect(res1.body.by_year).toEqual({});
      expect(res1.body.by_source_type).toEqual({});
      expect(res1.body.intensity_distribution).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect(res1.body.top_tags).toEqual([]);

      // Screams without tags
      await GoatScream.create({
        id: 'no-tags',
        title: 'No Tags',
        source_type: 'viral_video',
        audio: { duration: 2.5, intensity: 5 },
        approved: true,
      });
      const res2 = await request(app).get('/api/v1/stats').expect(200);
      expect(res2.body.total_screams).toBe(1);
      expect(res2.body.top_tags).toEqual([]);

      // Screams with null intensity
      await GoatScream.create({
        id: 'no-intensity',
        title: 'No Intensity',
        source_type: 'viral_video',
        audio: { duration: 2.5 },
        approved: true,
      });
      const res3 = await request(app).get('/api/v1/stats').expect(200);
      expect(res3.body.intensity_distribution.length).toBe(10);
      expect(res3.body.intensity_distribution[0]).toBeGreaterThanOrEqual(0);

      // Null year values
      await GoatScream.create({
        id: 'null-year',
        title: 'Null Year',
        source_type: 'viral_video',
        year: null,
        audio: { duration: 2.5, intensity: 5 },
        approved: true,
      });
      const res4 = await request(app).get('/api/v1/stats').expect(200);
      expect(res4.body).toHaveProperty('by_year');
    });
  });
});
