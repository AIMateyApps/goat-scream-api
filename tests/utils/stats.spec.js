const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { recordAccess } = require('../../src/utils/stats');
const GoatScream = require('../../src/models/GoatScream');

describe('stats utilities', () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const uri = mongo.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.connection.close();
    if (mongo) await mongo.stop();
  });

  beforeEach(async () => {
    await GoatScream.deleteMany({});
  });

  describe('recordAccess', () => {
    it('should increment stats and handle daily hits (same day vs new day)', async () => {
      // New document - initial stats
      const doc1 = await GoatScream.create({
        id: 'test-1',
        title: 'Test Scream',
        source_type: 'user_submission',
        audio: { duration: 2.5 },
        approved: true,
        stats: { api_calls: 0 },
      });
      await recordAccess([doc1.toObject()]);
      const updated1 = await GoatScream.findById(doc1._id);
      expect(updated1.stats.api_calls).toBe(1);
      expect(updated1.stats.daily_hits).toBe(1);
      expect(updated1.stats.last_accessed_date).toBeDefined();
      expect(updated1.stats.last_accessed_at).toBeDefined();

      // Same day access - increment daily_hits
      const today = new Date().toISOString().slice(0, 10);
      const doc2 = await GoatScream.create({
        id: 'test-2',
        title: 'Test Scream',
        source_type: 'user_submission',
        audio: { duration: 2.5 },
        approved: true,
        stats: {
          api_calls: 5,
          daily_hits: 2,
          last_accessed_date: today,
        },
      });
      await recordAccess([doc2.toObject()]);
      const updated2 = await GoatScream.findById(doc2._id);
      expect(updated2.stats.api_calls).toBe(6);
      expect(updated2.stats.daily_hits).toBe(3);
      expect(updated2.stats.last_accessed_date).toBe(today);

      // New day access - reset daily_hits
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      const doc3 = await GoatScream.create({
        id: 'test-3',
        title: 'Test Scream',
        source_type: 'user_submission',
        audio: { duration: 2.5 },
        approved: true,
        stats: {
          api_calls: 10,
          daily_hits: 5,
          last_accessed_date: yesterdayStr,
        },
      });
      await recordAccess([doc3.toObject()]);
      const updated3 = await GoatScream.findById(doc3._id);
      expect(updated3.stats.api_calls).toBe(11);
      expect(updated3.stats.daily_hits).toBe(1);
      expect(updated3.stats.last_accessed_date).toBe(new Date().toISOString().slice(0, 10));
    });

    it('should handle multiple documents, edge cases, and missing stats', async () => {
      // Multiple documents
      const docs = await GoatScream.create([
        {
          id: 'test-4',
          title: 'Test Scream 1',
          source_type: 'user_submission',
          audio: { duration: 2.5 },
          approved: true,
          stats: { api_calls: 0 },
        },
        {
          id: 'test-5',
          title: 'Test Scream 2',
          source_type: 'user_submission',
          audio: { duration: 2.5 },
          approved: true,
          stats: { api_calls: 0 },
        },
      ]);
      await recordAccess(docs.map(d => d.toObject()));
      const updated1 = await GoatScream.findById(docs[0]._id);
      const updated2 = await GoatScream.findById(docs[1]._id);
      expect(updated1.stats.api_calls).toBe(1);
      expect(updated2.stats.api_calls).toBe(1);

      // Empty/null/undefined arrays
      await expect(recordAccess([])).resolves.not.toThrow();
      await expect(recordAccess(null)).resolves.not.toThrow();
      await expect(recordAccess(undefined)).resolves.not.toThrow();

      // Document without stats (should initialize)
      const docNoStats = await GoatScream.create({
        id: 'test-6',
        title: 'Test Scream',
        source_type: 'user_submission',
        audio: { duration: 2.5 },
        approved: true,
      });
      await recordAccess([docNoStats.toObject()]);
      const updatedNoStats = await GoatScream.findById(docNoStats._id);
      expect(updatedNoStats.stats.api_calls).toBe(1);
      expect(updatedNoStats.stats.daily_hits).toBe(1);
    });
  });
});
