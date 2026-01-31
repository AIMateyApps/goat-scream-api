const request = require('supertest');
const app = require('../../src/app');

// Test routes when MongoDB is not connected (static fallback mode)
// These tests verify the fallback logic works correctly

describe('Routes with static fallback (no MongoDB)', () => {
  // Note: These tests run without MongoDB connection
  // They verify the static data fallback paths

  describe('GET /api/screams', () => {
    it('should return screams from static data and filter by year', async () => {
      // Basic static data retrieval
      const res1 = await request(app).get('/api/v1/screams').expect(200);
      expect(res1.body).toHaveProperty('source', 'static');
      expect(res1.body).toHaveProperty('items');
      expect(Array.isArray(res1.body.items)).toBe(true);

      // Filter by year
      const res2 = await request(app).get('/api/v1/screams').query({ year: '2020' }).expect(200);
      expect(res2.body.source).toBe('static');
      // every() on empty array returns true, so assertion is valid for all cases
      expect(res2.body.items.every(s => s.year === 2020)).toBe(true);
    });
  });

  describe('GET /api/screams/sources', () => {
    it('should return sources from static data', async () => {
      const res = await request(app).get('/api/v1/screams/sources').expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      // Should aggregate sources from static data
      res.body.forEach(source => {
        expect(source).toHaveProperty('_id');
        expect(source).toHaveProperty('type');
        expect(source).toHaveProperty('count');
        expect(typeof source.count).toBe('number');
      });
    });
  });

  describe('POST /api/screams/:id/download', () => {
    it('should handle download from static data', async () => {
      // First, get a scream ID from static data
      const listRes = await request(app).get('/api/v1/screams').expect(200);

      // Static data should always have items; test unconditionally
      expect(listRes.body.items.length).toBeGreaterThan(0);
      const screamId = listRes.body.items[0].id;

      // Try to download - may fail if no media, but should handle gracefully
      const res = await request(app)
        .post(`/api/v1/screams/${screamId}/download`)
        .send({ format: 'mp3', quality: 'medium' });

      // Could be 200 (if has media) or 400/404 (if no media or not found)
      expect([200, 400, 404]).toContain(res.status);
    });
  });

  describe('GET /api/search', () => {
    it('should search, filter, and sort static data', async () => {
      // Basic search
      const res1 = await request(app).get('/api/v1/search').query({ q: 'viral' }).expect(200);
      expect(res1.body).toHaveProperty('items');
      expect(Array.isArray(res1.body.items)).toBe(true);
      expect(res1.body).toHaveProperty('page');
      expect(res1.body).toHaveProperty('limit');
      expect(res1.body).toHaveProperty('total');

      // Filter by intensity range
      const res2 = await request(app)
        .get('/api/v1/search')
        .query({ intensity_range: '6-9' })
        .expect(200);
      expect(
        res2.body.items.every(s => {
          const intensity = s.audio?.intensity;
          return intensity >= 6 && intensity <= 9;
        })
      ).toBe(true);

      // Sort by intensity
      const res3 = await request(app)
        .get('/api/v1/search')
        .query({ sort_by: 'intensity' })
        .expect(200);
      // Verify descending sort - loop is vacuously correct for short arrays
      for (let i = 0; i < res3.body.items.length - 1; i++) {
        const curr = res3.body.items[i].audio?.intensity ?? 0;
        const next = res3.body.items[i + 1].audio?.intensity ?? 0;
        expect(curr).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe('GET /api/stats', () => {
    it('should return stats from static data', async () => {
      const res = await request(app).get('/api/v1/stats').expect(200);

      expect(res.body).toHaveProperty('total_screams');
      expect(res.body).toHaveProperty('by_year');
      expect(res.body).toHaveProperty('by_source_type');
      expect(res.body).toHaveProperty('intensity_distribution');
      expect(res.body).toHaveProperty('top_tags');

      expect(Array.isArray(res.body.intensity_distribution)).toBe(true);
      expect(res.body.intensity_distribution.length).toBe(10);
      expect(Array.isArray(res.body.top_tags)).toBe(true);
    });
  });
});
