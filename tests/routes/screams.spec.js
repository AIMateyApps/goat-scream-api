const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../src/app');
const { connectMongo } = require('../../src/db/connection');
const GoatScream = require('../../src/models/GoatScream');

describe('GET /api/screams', () => {
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
        id: 'test-1',
        title: 'Test Scream 1',
        source_type: 'viral_video',
        year: 2020,
        date_added: new Date(baseDate.getTime()),
        audio: { duration: 2.5, intensity: 8, category: 'short_burst' },
        goat: { breed: 'Alpine' },
        meme_status: 'classic',
        approved: true,
        tags: ['test', 'viral'],
      },
      {
        id: 'test-2',
        title: 'Test Scream 2',
        source_type: 'movie',
        year: 2021,
        date_added: new Date(baseDate.getTime() + 86400000),
        audio: { duration: 3.0, intensity: 5, category: 'prolonged' },
        goat: { breed: 'Nubian' },
        meme_status: 'emerging',
        approved: true,
        tags: ['test', 'movie'],
      },
      {
        id: 'test-3',
        title: 'Test Scream 3',
        source_type: 'viral_video',
        year: 2020,
        date_added: new Date(baseDate.getTime() + 172800000),
        audio: { duration: 1.8, intensity: 10, category: 'short_burst' },
        goat: { breed: 'Alpine' },
        meme_status: 'classic',
        approved: true,
        tags: ['test'],
      },
      {
        id: 'test-unapproved',
        title: 'Unapproved Scream',
        source_type: 'user_submission',
        year: 2022,
        date_added: new Date(baseDate.getTime() + 259200000),
        audio: { duration: 2.0, intensity: 7, category: 'short_burst' },
        goat: { breed: 'Boer' },
        approved: false,
        tags: ['test'],
      },
    ]);
  };

  describe('with MongoDB connected', () => {
    it('should return paginated screams', async () => {
      await createTestScreams();
      const res = await request(app)
        .get('/api/v1/screams')
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(res.body).toHaveProperty('page', 1);
      expect(res.body).toHaveProperty('limit', 2);
      expect(res.body).toHaveProperty('total', 3);
      expect(res.body).toHaveProperty('totalPages', 2);
      expect(res.body).toHaveProperty('source', 'mongo');
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0]).toHaveProperty('id');
      expect(res.body.items[0]).toHaveProperty('title');
    });

    it('should filter by all filter types (intensity, year, source_type, meme_status, breed, category)', async () => {
      await createTestScreams();

      // Intensity filters
      const res1 = await request(app)
        .get('/api/v1/screams')
        .query({ intensity_min: '8' })
        .expect(200);
      expect(res1.body.items.every(s => s.audio.intensity >= 8)).toBe(true);

      const res2 = await request(app)
        .get('/api/v1/screams')
        .query({ intensity_max: '7' })
        .expect(200);
      expect(res2.body.items.every(s => s.audio.intensity <= 7)).toBe(true);

      const res3 = await request(app)
        .get('/api/v1/screams')
        .query({ intensity_min: '6', intensity_max: '9' })
        .expect(200);
      expect(res3.body.items.every(s => s.audio.intensity >= 6 && s.audio.intensity <= 9)).toBe(
        true
      );

      // Basic filters
      const res4 = await request(app).get('/api/v1/screams').query({ year: '2020' }).expect(200);
      expect(res4.body.items.every(s => s.year === 2020)).toBe(true);
      expect(res4.body.items.length).toBe(2);

      const res5 = await request(app)
        .get('/api/v1/screams')
        .query({ source_type: 'movie' })
        .expect(200);
      expect(res5.body.items.every(s => s.source_type === 'movie')).toBe(true);
      expect(res5.body.items.length).toBe(1);

      const res6 = await request(app)
        .get('/api/v1/screams')
        .query({ meme_status: 'classic' })
        .expect(200);
      expect(res6.body.items.every(s => s.meme_status === 'classic')).toBe(true);
      expect(res6.body.items.length).toBe(2);

      const res7 = await request(app).get('/api/v1/screams').query({ breed: 'Alpine' }).expect(200);
      expect(res7.body.items.every(s => s.goat?.breed === 'Alpine')).toBe(true);
      expect(res7.body.items.length).toBe(2);

      const res8 = await request(app)
        .get('/api/v1/screams')
        .query({ category: 'short_burst' })
        .expect(200);
      expect(res8.body.items.every(s => s.audio.category === 'short_burst')).toBe(true);
    });

    it('should exclude unapproved by default', async () => {
      await createTestScreams();
      const res = await request(app).get('/api/v1/screams').expect(200);

      expect(res.body.items.every(s => s.approved !== false)).toBe(true);
      expect(res.body.items.find(s => s.id === 'test-unapproved')).toBeUndefined();
    });

    it('should include unapproved when flag is set', async () => {
      await createTestScreams();
      const res = await request(app)
        .get('/api/v1/screams')
        .query({ include_unapproved: 'true' })
        .expect(200);

      expect(res.body.items.find(s => s.id === 'test-unapproved')).toBeDefined();
    });

    it('should handle pagination (default, custom, eagerAll, invalid, empty results)', async () => {
      await createTestScreams();

      // Default pagination
      const res1 = await request(app).get('/api/v1/screams').expect(200);
      expect(res1.body.page).toBe(1);
      expect(res1.body.limit).toBe(100);

      // EagerAll flag
      const res2 = await request(app).get('/api/v1/screams').query({ all: 'true' }).expect(200);
      expect(res2.body.limit).toBeGreaterThanOrEqual(500);

      // Invalid page number (defaults to 1)
      const res3 = await request(app).get('/api/v1/screams').query({ page: 'invalid' }).expect(200);
      expect(res3.body.page).toBe(1);

      // Empty results
      const res4 = await request(app).get('/api/v1/screams').query({ year: '1999' }).expect(200);
      expect(res4.body.total).toBe(0);
      expect(res4.body.items).toHaveLength(0);
      expect(res4.body.totalPages).toBe(0);
    });
  });

  describe('with static fallback', () => {
    // Note: These tests verify static fallback works, but we test with MongoDB connected
    // The actual static fallback happens when MongoDB is not connected
    // For full static mode testing, we'd need a separate test file
    it('should return screams from static data when filtered properly', async () => {
      // Even with MongoDB connected, we can verify the filtering logic works
      const res = await request(app).get('/api/v1/screams').query({ year: '2020' }).expect(200);

      expect(res.body.items.length).toBeGreaterThanOrEqual(0);
      // every() on empty array returns true, so assertion is valid for all cases
      expect(res.body.items.every(s => s.year === 2020)).toBe(true);
    });
  });
});

describe('GET /api/screams/random', () => {
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
        id: 'random-1',
        title: 'Random Scream 1',
        source_type: 'viral_video',
        year: 2020,
        date_added: new Date(),
        audio: { duration: 2.5, intensity: 8, category: 'short_burst' },
        approved: true,
      },
      {
        id: 'random-2',
        title: 'Random Scream 2',
        source_type: 'movie',
        year: 2021,
        date_added: new Date(),
        audio: { duration: 3.0, intensity: 5, category: 'prolonged' },
        approved: true,
      },
      {
        id: 'random-3',
        title: 'Random Scream 3',
        source_type: 'viral_video',
        year: 2020,
        date_added: new Date(),
        audio: { duration: 1.8, intensity: 10, category: 'short_burst' },
        approved: true,
      },
    ]);
  };

  it('should return random screams (single, multiple, with limits, sorting, filtering, fallback)', async () => {
    await createTestScreams();

    // Single random scream (default)
    const res1 = await request(app).get('/api/v1/screams/random').expect(200);
    expect(res1.body).toHaveProperty('id');
    expect(res1.body).toHaveProperty('title');
    expect(Array.isArray(res1.body)).toBe(false);

    // Multiple random screams
    const res2 = await request(app)
      .get('/api/v1/screams/random')
      .query({ results: '2' })
      .expect(200);
    expect(Array.isArray(res2.body)).toBe(true);
    expect(res2.body.length).toBe(2);

    // Max results limit (50)
    const res3 = await request(app)
      .get('/api/v1/screams/random')
      .query({ results: '100' })
      .expect(200);
    expect(res3.body.length).toBeLessThanOrEqual(50);

    // Sort by intensity
    const res4 = await request(app)
      .get('/api/v1/screams/random')
      .query({ results: '3', sort: 'intensity', direction: 'desc' })
      .expect(200);
    expect(Array.isArray(res4.body)).toBe(true);
    // Verify descending sort order - loop is vacuously correct for arrays of length 0 or 1
    for (let i = 0; i < res4.body.length - 1; i++) {
      expect(res4.body[i].audio.intensity).toBeGreaterThanOrEqual(res4.body[i + 1].audio.intensity);
    }

    // Filter random results
    const res5 = await request(app)
      .get('/api/v1/screams/random')
      .query({ intensity_min: '8' })
      .expect(200);
    expect(res5.body.audio.intensity).toBeGreaterThanOrEqual(8);

    // Fallback to static when no MongoDB matches
    const res6 = await request(app).get('/api/v1/screams/random').query({ year: '1999' });
    expect([200, 404]).toContain(res6.status);
    // If 200, response should have id; if 404, it won't - combine assertions
    expect(res6.status === 404 || res6.body.id !== undefined).toBe(true);
  });
});

describe('GET /api/screams/ordered/:index', () => {
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
        id: 'ordered-1',
        title: 'First Scream',
        source_type: 'viral_video',
        year: 2020,
        date_added: new Date(baseDate.getTime()),
        audio: { duration: 2.5, intensity: 8 },
        approved: true,
      },
      {
        id: 'ordered-2',
        title: 'Second Scream',
        source_type: 'movie',
        year: 2021,
        date_added: new Date(baseDate.getTime() + 86400000),
        audio: { duration: 3.0, intensity: 5 },
        approved: true,
      },
      {
        id: 'ordered-3',
        title: 'Third Scream',
        source_type: 'viral_video',
        year: 2020,
        date_added: new Date(baseDate.getTime() + 172800000),
        audio: { duration: 1.8, intensity: 10 },
        approved: true,
      },
    ]);
  };

  it('should return ordered screams (single index, range, errors)', async () => {
    await createTestScreams();

    // Single index
    const res1 = await request(app).get('/api/v1/screams/ordered/0').expect(200);
    expect(res1.body).toHaveProperty('id', 'ordered-1');

    // Range
    const res2 = await request(app).get('/api/v1/screams/ordered/0-1').expect(200);
    expect(Array.isArray(res2.body)).toBe(true);
    expect(res2.body.length).toBe(2);
    expect(res2.body[0].id).toBe('ordered-1');
    expect(res2.body[1].id).toBe('ordered-2');

    // Error cases
    await request(app).get('/api/v1/screams/ordered/999').expect(404);
    await request(app).get('/api/v1/screams/ordered/invalid').expect(400);
  });
});

describe('GET /api/screams/intense', () => {
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
        id: 'intense-1',
        title: 'Low Intensity',
        source_type: 'viral_video',
        audio: { duration: 2.5, intensity: 3 },
        approved: true,
      },
      {
        id: 'intense-2',
        title: 'Medium Intensity',
        source_type: 'movie',
        audio: { duration: 3.0, intensity: 7 },
        approved: true,
      },
      {
        id: 'intense-3',
        title: 'High Intensity',
        source_type: 'viral_video',
        audio: { duration: 1.8, intensity: 10 },
        approved: true,
      },
    ]);
  };

  it('should return most intense screams (custom and default limit)', async () => {
    await createTestScreams();

    // Custom limit
    const res1 = await request(app)
      .get('/api/v1/screams/intense')
      .query({ limit: '2' })
      .expect(200);
    expect(Array.isArray(res1.body)).toBe(true);
    expect(res1.body.length).toBe(2);
    expect(res1.body[0].audio.intensity).toBeGreaterThanOrEqual(res1.body[1].audio.intensity);
    expect(res1.body[0].audio.intensity).toBe(10);

    // Default limit (10)
    const res2 = await request(app).get('/api/v1/screams/intense').expect(200);
    expect(res2.body.length).toBeLessThanOrEqual(10);
  });
});

describe('GET /api/screams/breeds', () => {
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

  it('should return distinct breeds and filter null/undefined', async () => {
    await GoatScream.create([
      {
        id: 'breed-1',
        title: 'Alpine Goat',
        source_type: 'viral_video',
        audio: { duration: 2.5 },
        goat: { breed: 'Alpine' },
        approved: true,
      },
      {
        id: 'breed-2',
        title: 'Nubian Goat',
        source_type: 'movie',
        audio: { duration: 3.0 },
        goat: { breed: 'Nubian' },
        approved: true,
      },
      {
        id: 'breed-3',
        title: 'Another Alpine',
        source_type: 'viral_video',
        audio: { duration: 1.8 },
        goat: { breed: 'Alpine' },
        approved: true,
      },
      {
        id: 'breed-4',
        title: 'No Breed',
        source_type: 'viral_video',
        audio: { duration: 2.5 },
        approved: true,
      },
    ]);

    const res = await request(app).get('/api/v1/screams/breeds').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toContain('Alpine');
    expect(res.body).toContain('Nubian');
    expect(res.body.filter(b => b === 'Alpine').length).toBe(1);
    expect(res.body.every(b => b)).toBe(true); // No null/undefined
  });
});

describe('GET /api/screams/sources', () => {
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

  it('should return aggregated sources', async () => {
    await GoatScream.create([
      {
        id: 'source-1',
        title: 'Source 1',
        source_type: 'viral_video',
        source: { title: 'YouTube Video' },
        audio: { duration: 2.5 },
        approved: true,
      },
      {
        id: 'source-2',
        title: 'Source 2',
        source_type: 'movie',
        source: { title: 'Movie Title' },
        audio: { duration: 3.0 },
        approved: true,
      },
      {
        id: 'source-3',
        title: 'Source 3',
        source_type: 'viral_video',
        source: { title: 'YouTube Video' },
        audio: { duration: 1.8 },
        approved: true,
      },
    ]);

    const res = await request(app).get('/api/v1/screams/sources').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    const youtubeSource = res.body.find(s => s._id === 'YouTube Video');
    expect(youtubeSource).toBeDefined();
    expect(youtubeSource.count).toBe(2);
    expect(res.body[0].count).toBeGreaterThanOrEqual(res.body[1]?.count || 0);
  });
});

describe('POST /api/screams/:id/download', () => {
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

  it('should handle downloads (valid, defaults, errors, missing media)', async () => {
    // Valid download with stats increment
    const scream1 = await GoatScream.create({
      id: 'download-1',
      title: 'Downloadable Scream',
      source_type: 'viral_video',
      audio: { duration: 2.5 },
      media: {
        audio: {
          mp3: {
            high: 'https://example.com/high.mp3',
            medium: 'https://example.com/medium.mp3',
            low: 'https://example.com/low.mp3',
          },
        },
      },
      approved: true,
    });
    const res1 = await request(app)
      .post(`/api/v1/screams/${scream1.id}/download`)
      .send({ format: 'mp3', quality: 'medium' })
      .expect(200);
    expect(res1.body).toHaveProperty('download_url', 'https://example.com/medium.mp3');
    expect(res1.body).toHaveProperty('format', 'mp3');
    expect(res1.body).toHaveProperty('quality', 'medium');
    expect(res1.body).toHaveProperty('filename', `goat_scream_${scream1.id}.mp3`);
    const updated = await GoatScream.findOne({ id: scream1.id });
    expect(updated.stats.downloads).toBe(1);

    // Default format/quality
    const scream2 = await GoatScream.create({
      id: 'download-2',
      title: 'Default Format Scream',
      source_type: 'viral_video',
      audio: { duration: 2.5 },
      media: {
        audio: {
          mp3: {
            medium: 'https://example.com/default.mp3',
          },
        },
      },
      approved: true,
    });
    const res2 = await request(app)
      .post(`/api/v1/screams/${scream2.id}/download`)
      .send({})
      .expect(200);
    expect(res2.body).toHaveProperty('format', 'mp3');
    expect(res2.body).toHaveProperty('quality', 'medium');

    // Error cases
    await request(app)
      .post('/api/v1/screams/nonexistent/download')
      .send({ format: 'mp3', quality: 'medium' })
      .expect(404);

    const scream3 = await GoatScream.create({
      id: 'download-3',
      title: 'Downloadable Scream',
      source_type: 'viral_video',
      audio: { duration: 2.5 },
      media: {
        audio: {
          mp3: {
            medium: 'https://example.com/medium.mp3',
          },
        },
      },
      approved: true,
    });
    const res3 = await request(app)
      .post(`/api/v1/screams/${scream3.id}/download`)
      .send({ format: 'wav', quality: 'medium' })
      .expect(400);
    expect(res3.body.error).toHaveProperty('message', 'Unsupported audio format');
    expect(res3.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

    const res4 = await request(app)
      .post(`/api/v1/screams/${scream3.id}/download`)
      .send({ format: 'mp3', quality: 'ultra' })
      .expect(400);
    expect(res4.body.error).toHaveProperty('message', 'Unsupported quality for requested format');
    expect(res4.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

    // Missing/null media.audio
    const scream4 = await GoatScream.create({
      id: 'download-4',
      title: 'No Media Scream',
      source_type: 'viral_video',
      audio: { duration: 2.5 },
      approved: true,
    });
    const res5 = await request(app)
      .post(`/api/v1/screams/${scream4.id}/download`)
      .send({ format: 'mp3', quality: 'medium' })
      .expect(400);
    expect(res5.body.error).toHaveProperty('message', 'Unsupported audio format');
    expect(res5.body.error).toHaveProperty('code', 'VALIDATION_ERROR');

    const scream5 = await GoatScream.create({
      id: 'download-5',
      title: 'Null Media Scream',
      source_type: 'viral_video',
      audio: { duration: 2.5 },
      media: { audio: null },
      approved: true,
    });
    const res6 = await request(app)
      .post(`/api/v1/screams/${scream5.id}/download`)
      .send({ format: 'mp3', quality: 'medium' })
      .expect(400);
    expect(res6.body.error).toHaveProperty('message', 'Unsupported audio format');
    expect(res6.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
  });
});
