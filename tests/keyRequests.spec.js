const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../src/app');
const { connectMongo } = require('../src/db/connection');
const ApiKey = require('../src/models/ApiKey');
const KeyRequest = require('../src/models/KeyRequest');

const ADMIN_TOKEN = 'test-admin-token';

describe('API key request flow', () => {
  let mongo;

  beforeAll(async () => {
    process.env.ADMIN_TOKEN = ADMIN_TOKEN;
    mongo = await MongoMemoryServer.create();
    const uri = mongo.getUri();
    process.env.MONGODB_URI = uri;
    await connectMongo({ uri });
  });

  afterAll(async () => {
    await mongoose.connection.close();
    if (mongo) await mongo.stop();
  });

  afterEach(async () => {
    await Promise.all([ApiKey.deleteMany({}), KeyRequest.deleteMany({})]);
  });

  it('accepts a new API key request', async () => {
    const res = await request(app)
      .post('/api/v1/keys/requests')
      .send({ name: 'Test User', email: 'user@example.com', intended_use: 'Alerts' })
      .expect(202);

    expect(res.body.request).toHaveProperty('status', 'pending');
    const stored = await KeyRequest.findOne({ email: 'user@example.com' });
    expect(stored).not.toBeNull();
  });

  it('requires name and email', async () => {
    const res = await request(app)
      .post('/api/v1/keys/requests')
      .send({ name: '', email: '' })
      .expect(400);
    expect(res.body).toHaveProperty('error');
  });

  it('allows admins to list and approve requests', async () => {
    const { body: createRes } = await request(app)
      .post('/api/v1/keys/requests')
      .send({ name: 'Partner', email: 'partner@example.com', intended_use: 'App alerts' })
      .expect(202);

    const { body: listRes } = await request(app)
      .get('/api/v1/keys/requests')
      .set('x-admin-token', ADMIN_TOKEN)
      .expect(200);

    expect(listRes.items.length).toBe(1);
    const id = listRes.items[0]._id || createRes.request.id;

    const approveRes = await request(app)
      .patch(`/api/v1/keys/requests/${id}/approve`)
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ tier: 'basic' })
      .expect(200);

    expect(approveRes.body).toHaveProperty('api_key');
    const issuedKey = await ApiKey.findOne({ key: approveRes.body.api_key });
    expect(issuedKey).not.toBeNull();

    const updatedRequest = await KeyRequest.findById(id);
    expect(updatedRequest.status).toBe('approved');
  });
});
