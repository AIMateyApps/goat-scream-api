const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../src/app');
const { connectMongo } = require('../../src/db/connection');
const ApiKey = require('../../src/models/ApiKey');

describe('apiKey middleware', () => {
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
    await ApiKey.deleteMany({});
  });

  it('should allow requests without API key (public access)', async () => {
    const res = await request(app).get('/api/v1/screams').expect(200);

    expect(res.body).toHaveProperty('items');
  });

  it('should allow requests with valid API key', async () => {
    await ApiKey.create({
      key: 'test-key-123',
      label: 'Test Key',
      status: 'active',
      tier: 'basic',
      quota_per_minute: 200,
    });

    const res = await request(app)
      .get('/api/v1/screams')
      .set('x-api-key', 'test-key-123')
      .expect(200);

    expect(res.body).toHaveProperty('items');
  });

  it('should reject requests with invalid or disabled API keys', async () => {
    // Invalid key
    const res1 = await request(app)
      .get('/api/v1/screams')
      .set('x-api-key', 'invalid-key')
      .expect(401);
    expect(res1.body.error).toHaveProperty('message', 'Invalid or inactive API key');
    expect(res1.body.error).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    expect(res1.body.error).toHaveProperty('auth_type', 'api_key');

    // Disabled key
    await ApiKey.create({
      key: 'disabled-key',
      label: 'Disabled Key',
      status: 'disabled',
      tier: 'basic',
    });

    const res2 = await request(app)
      .get('/api/v1/screams')
      .set('x-api-key', 'disabled-key')
      .expect(401);
    expect(res2.body.error).toHaveProperty('message', 'Invalid or inactive API key');
    expect(res2.body.error).toHaveProperty('code', 'AUTHENTICATION_ERROR');
    expect(res2.body.error).toHaveProperty('auth_type', 'api_key');
  });

  it('should use API key quota when provided', async () => {
    await ApiKey.create({
      key: 'custom-quota-key',
      label: 'Custom Quota Key',
      status: 'active',
      tier: 'basic',
      quota_per_minute: 500,
    });

    // Make a request - should succeed
    const res = await request(app)
      .get('/api/v1/screams')
      .set('x-api-key', 'custom-quota-key')
      .expect(200);

    expect(res.body).toHaveProperty('items');
  });

  it('should handle database errors gracefully', async () => {
    await mongoose.connection.close();

    const res = await request(app).get('/api/v1/screams').set('x-api-key', 'test-key').expect(503);

    expect(res.body.error).toHaveProperty('message', 'API key lookup failed');
    expect(res.body.error).toHaveProperty('code', 'DATABASE_ERROR');

    // Reconnect for other tests
    await connectMongo({ uri: mongo.getUri() });
  });
});
