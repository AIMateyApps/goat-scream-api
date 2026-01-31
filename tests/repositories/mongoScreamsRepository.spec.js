const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const MongoScreamsRepository = require('../../src/repositories/mongoScreamsRepository');
const GoatScream = require('../../src/models/GoatScream');
const { connectMongo } = require('../../src/db/connection');

describe('MongoScreamsRepository', () => {
  let repository;
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const uri = mongo.getUri();
    process.env.MONGODB_URI = uri;
    await connectMongo({ uri });
    repository = new MongoScreamsRepository();
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
        id: 'test-1',
        title: 'Test Scream 1',
        source_type: 'viral_video',
        year: 2020,
        date_added: new Date('2020-01-01'),
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
        date_added: new Date('2021-01-01'),
        audio: { duration: 3.0, intensity: 5, category: 'prolonged' },
        goat: { breed: 'Nubian' },
        meme_status: 'emerging',
        approved: true,
        tags: ['test', 'funny'],
      },
      {
        id: 'test-3',
        title: 'Test Scream 3',
        source_type: 'viral_video',
        year: 2022,
        date_added: new Date('2022-01-01'),
        audio: { duration: 1.5, intensity: 10, category: 'short_burst' },
        goat: { breed: 'Alpine' },
        approved: false, // Unapproved
        tags: ['test'],
      },
    ]);
  };

  describe('find', () => {
    it('should find all approved screams', async () => {
      await createTestScreams();

      const results = await repository.find({ approved: true });

      expect(results).toHaveLength(2);
      expect(results.every(s => s.approved === true)).toBe(true);
      expect(results.every(s => !s._id && !s.__v)).toBe(true); // lean() removes _id and __v
    });

    it('should filter by year', async () => {
      await createTestScreams();

      const results = await repository.find({ approved: true, year: 2020 });

      expect(results).toHaveLength(1);
      expect(results[0].year).toBe(2020);
    });

    it('should apply sort', async () => {
      await createTestScreams();

      const results = await repository.find({ approved: true }, { sort: { year: 1 } });

      expect(results[0].year).toBe(2020);
      expect(results[1].year).toBe(2021);
    });

    it('should apply skip and limit', async () => {
      await createTestScreams();

      const results = await repository.find({ approved: true }, { skip: 1, limit: 1 });

      expect(results).toHaveLength(1);
    });

    it('should apply projection', async () => {
      await createTestScreams();

      const results = await repository.find(
        { approved: true },
        { projection: { title: 1, year: 1 } }
      );

      expect(results[0]).toHaveProperty('title');
      expect(results[0]).toHaveProperty('year');
      expect(results[0]).not.toHaveProperty('audio');
    });
  });

  describe('findById', () => {
    it('should find scream by ID', async () => {
      await createTestScreams();

      const result = await repository.findById('test-1');

      expect(result).toBeTruthy();
      expect(result.id).toBe('test-1');
      expect(result.approved).toBe(true);
    });

    it('should return null for non-existent ID', async () => {
      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should return null for unapproved scream', async () => {
      await createTestScreams();

      const result = await repository.findById('test-3');

      expect(result).toBeNull();
    });
  });

  describe('findRandom', () => {
    it('should return random screams', async () => {
      await createTestScreams();

      const results = await repository.findRandom({ approved: true }, 2);

      expect(results).toHaveLength(2);
      expect(results.every(s => s.approved === true)).toBe(true);
    });

    it('should return fewer results if limit exceeds available', async () => {
      await createTestScreams();

      const results = await repository.findRandom({ approved: true }, 10);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should filter by criteria', async () => {
      await createTestScreams();

      const results = await repository.findRandom({ approved: true, year: 2020 }, 5);

      expect(results.every(s => s.year === 2020)).toBe(true);
    });
  });

  describe('count', () => {
    it('should count approved screams', async () => {
      await createTestScreams();

      const count = await repository.count({ approved: true });

      expect(count).toBe(2);
    });

    it('should count filtered screams', async () => {
      await createTestScreams();

      const count = await repository.count({ approved: true, year: 2020 });

      expect(count).toBe(1);
    });

    it('should return 0 for no matches', async () => {
      const count = await repository.count({ approved: true, year: 9999 });

      expect(count).toBe(0);
    });
  });

  describe('aggregate', () => {
    it('should run aggregation pipeline', async () => {
      await createTestScreams();

      const results = await repository.aggregate([
        { $match: { approved: true } },
        { $group: { _id: '$year', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]._id).toBe(2020);
      expect(results[0].count).toBe(1);
    });

    it('should handle $group with $sum', async () => {
      await createTestScreams();

      const results = await repository.aggregate([
        { $match: { approved: true } },
        { $group: { _id: '$source_type', count: { $sum: 1 } } },
      ]);

      expect(results.some(r => r._id === 'viral_video')).toBe(true);
      expect(results.some(r => r._id === 'movie')).toBe(true);
    });
  });

  describe('distinct', () => {
    it('should return distinct values', async () => {
      await createTestScreams();

      const breeds = await repository.distinct('goat.breed', { approved: true });

      expect(breeds).toContain('Alpine');
      expect(breeds).toContain('Nubian');
      expect(breeds.length).toBe(2);
    });

    it('should filter distinct values', async () => {
      await createTestScreams();

      const breeds = await repository.distinct('goat.breed', {
        approved: true,
        year: 2020,
      });

      expect(breeds).toContain('Alpine');
      expect(breeds.length).toBe(1);
    });
  });

  describe('updateOne', () => {
    it('should update a document', async () => {
      await createTestScreams();

      const result = await repository.updateOne(
        { id: 'test-1' },
        { $set: { title: 'Updated Title' } }
      );

      expect(result.acknowledged).toBe(true);
      expect(result.modifiedCount).toBe(1);

      const updated = await repository.findById('test-1');
      expect(updated.title).toBe('Updated Title');
    });

    it('should increment a field', async () => {
      await createTestScreams();

      await repository.updateOne({ id: 'test-1' }, { $inc: { 'stats.downloads': 1 } });

      const updated = await GoatScream.findOne({ id: 'test-1' }).lean();
      expect(updated.stats.downloads).toBe(1);
    });

    it('should return acknowledged: false if no match', async () => {
      const result = await repository.updateOne(
        { id: 'nonexistent' },
        { $set: { title: 'Updated' } }
      );

      expect(result.modifiedCount).toBe(0);
    });
  });

  describe('getCircuitBreakerState', () => {
    it('should return circuit breaker state for MongoDB', () => {
      const state = MongoScreamsRepository.getCircuitBreakerState();

      expect(state).toBeDefined();
      expect(state).toHaveProperty('state');
    });
  });
});
