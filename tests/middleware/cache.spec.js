const request = require('supertest');
const express = require('express');
const cacheMiddleware = require('../../src/middleware/cache');

describe('Cache Middleware', () => {
  describe('Unit Tests', () => {
    const { generateETag, etagMatches, DEFAULT_CONFIG } = cacheMiddleware;

    describe('generateETag', () => {
      it('should generate a weak ETag from content', () => {
        const etag = generateETag('hello world');
        expect(etag).toMatch(/^W\/"[a-f0-9]{16}"$/);
      });

      it('should generate consistent ETags for the same content', () => {
        const content = JSON.stringify({ data: [1, 2, 3] });
        const etag1 = generateETag(content);
        const etag2 = generateETag(content);
        expect(etag1).toBe(etag2);
      });

      it('should generate different ETags for different content', () => {
        const etag1 = generateETag('content1');
        const etag2 = generateETag('content2');
        expect(etag1).not.toBe(etag2);
      });
    });

    describe('etagMatches', () => {
      it('should return true for exact match', () => {
        const etag = 'W/"abc123"';
        expect(etagMatches(etag, etag)).toBe(true);
      });

      it('should return true for wildcard', () => {
        expect(etagMatches('*', 'W/"abc123"')).toBe(true);
      });

      it('should return true for match without W/ prefix', () => {
        expect(etagMatches('"abc123"', 'W/"abc123"')).toBe(true);
      });

      it('should return true for match in comma-separated list', () => {
        expect(etagMatches('W/"other", W/"abc123", W/"another"', 'W/"abc123"')).toBe(true);
      });

      it('should return false for no match', () => {
        expect(etagMatches('W/"other"', 'W/"abc123"')).toBe(false);
      });

      it('should return false for null/undefined values', () => {
        expect(etagMatches(null, 'W/"abc123"')).toBe(false);
        expect(etagMatches('W/"abc123"', null)).toBe(false);
        expect(etagMatches(undefined, undefined)).toBe(false);
      });
    });

    describe('DEFAULT_CONFIG', () => {
      it('should have no-store for random endpoint', () => {
        expect(DEFAULT_CONFIG['/api/v1/screams/random'].directive).toBe('no-store');
      });

      it('should have public caching for screams list', () => {
        expect(DEFAULT_CONFIG['/api/v1/screams'].directive).toBe('public');
        expect(DEFAULT_CONFIG['/api/v1/screams'].maxAge).toBeGreaterThan(0);
      });

      it('should have no-store for health endpoints', () => {
        expect(DEFAULT_CONFIG['/health'].directive).toBe('no-store');
        expect(DEFAULT_CONFIG['/ready'].directive).toBe('no-store');
        expect(DEFAULT_CONFIG['/metrics'].directive).toBe('no-store');
      });
    });
  });

  describe('Integration Tests', () => {
    let app;

    beforeEach(() => {
      app = express();
      // Disable Express's built-in ETag to test our middleware in isolation
      app.set('etag', false);
      app.use(cacheMiddleware());
    });

    describe('Cache-Control headers', () => {
      it('should set no-store for /health', async () => {
        app.get('/health', (req, res) => res.json({ status: 'ok' }));

        const res = await request(app).get('/health');

        expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
        expect(res.headers['etag']).toBeUndefined();
      });

      it('should set public caching for /api/v1/screams', async () => {
        app.get('/api/v1/screams', (req, res) => res.json({ data: [] }));

        const res = await request(app).get('/api/v1/screams');

        expect(res.headers['cache-control']).toMatch(/^public/);
        expect(res.headers['cache-control']).toMatch(/max-age=\d+/);
        expect(res.headers['etag']).toBeDefined();
      });

      it('should set public caching for nested screams routes', async () => {
        app.get('/api/v1/screams/123', (req, res) => res.json({ id: '123' }));

        const res = await request(app).get('/api/v1/screams/123');

        expect(res.headers['cache-control']).toMatch(/^public/);
      });

      it('should set no-store for /api/v1/screams/random', async () => {
        app.get('/api/v1/screams/random', (req, res) => res.json({ data: [] }));

        const res = await request(app).get('/api/v1/screams/random');

        expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
      });

      it('should not set headers for unconfigured routes', async () => {
        app.get('/unknown', (req, res) => res.json({ data: [] }));

        const res = await request(app).get('/unknown');

        expect(res.headers['cache-control']).toBeUndefined();
      });

      it('should include stale-while-revalidate when configured', async () => {
        app.get('/api/v1/search', (req, res) => res.json({ results: [] }));

        const res = await request(app).get('/api/v1/search');

        expect(res.headers['cache-control']).toMatch(/stale-while-revalidate=\d+/);
      });
    });

    describe('ETag handling', () => {
      it('should generate ETag for cacheable responses', async () => {
        app.get('/api/v1/screams', (req, res) => res.json({ data: [1, 2, 3] }));

        const res = await request(app).get('/api/v1/screams');

        expect(res.headers['etag']).toMatch(/^W\/"[a-f0-9]{16}"$/);
      });

      it('should return 304 for matching If-None-Match', async () => {
        app.get('/api/v1/screams', (req, res) => res.json({ data: [1, 2, 3] }));

        // First request to get ETag
        const res1 = await request(app).get('/api/v1/screams');
        const etag = res1.headers['etag'];

        // Second request with If-None-Match
        const res2 = await request(app).get('/api/v1/screams').set('If-None-Match', etag);

        expect(res2.status).toBe(304);
        expect(res2.body).toEqual({});
      });

      it('should return 200 for non-matching If-None-Match', async () => {
        app.get('/api/v1/screams', (req, res) => res.json({ data: [1, 2, 3] }));

        const res = await request(app).get('/api/v1/screams').set('If-None-Match', 'W/"wrongetag"');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ data: [1, 2, 3] });
      });

      it('should not generate ETag for no-store responses', async () => {
        app.get('/health', (req, res) => res.json({ status: 'ok' }));

        const res = await request(app).get('/health');

        expect(res.headers['etag']).toBeUndefined();
      });
    });

    describe('Method handling', () => {
      it('should skip caching for POST requests', async () => {
        app.post('/api/v1/screams', (req, res) => res.json({ created: true }));

        const res = await request(app).post('/api/v1/screams');

        expect(res.headers['cache-control']).toBeUndefined();
        expect(res.headers['etag']).toBeUndefined();
      });

      it('should apply caching for HEAD requests', async () => {
        app.head('/api/v1/screams', (req, res) => res.end());

        const res = await request(app).head('/api/v1/screams');

        expect(res.headers['cache-control']).toMatch(/^public/);
      });
    });

    describe('Custom configuration', () => {
      it('should allow custom route configuration', async () => {
        const customApp = express();
        customApp.set('etag', false);
        customApp.use(
          cacheMiddleware({
            routes: {
              '/custom': { directive: 'private', maxAge: 120 },
            },
          })
        );
        customApp.get('/custom', (req, res) => res.json({ data: 'custom' }));

        const res = await request(customApp).get('/custom');

        expect(res.headers['cache-control']).toBe('private, max-age=120');
      });

      it('should allow disabling ETag generation', async () => {
        const noEtagApp = express();
        noEtagApp.set('etag', false);
        noEtagApp.use(cacheMiddleware({ etag: false }));
        noEtagApp.get('/api/v1/screams', (req, res) => res.json({ data: [] }));

        const res = await request(noEtagApp).get('/api/v1/screams');

        expect(res.headers['cache-control']).toMatch(/^public/);
        expect(res.headers['etag']).toBeUndefined();
      });
    });
  });
});
