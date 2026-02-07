const { Readable } = require('stream');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../src/services/storage', () => {
  return {
    uploadSubmissionAudio: jest.fn(() =>
      Promise.resolve({
        publicId: 'goat-screams/submissions/mock-id',
        url: 'https://cloudinary.example.com/submissions/mock.mp3',
        duration: 2.1,
      })
    ),
    promoteSubmissionAudio: jest.fn(() =>
      Promise.resolve({
        publicId: 'goat-screams/audio/mock-goat',
        url: 'https://cloudinary.example.com/audio/mock.mp3',
      })
    ),
    deleteSubmissionAudio: jest.fn(() => Promise.resolve()),
  };
});

jest.mock('../src/services/analysis', () => ({
  analyzeAudio: jest.fn(() =>
    Promise.resolve({
      duration: 1.6,
      intensity: 8,
      peak_decibels: -3,
      dominant_frequency: 320,
      category: 'short_burst',
    })
  ),
}));

jest.mock('axios');

const axios = require('axios');
const {
  uploadSubmissionAudio,
  promoteSubmissionAudio,
  deleteSubmissionAudio,
} = require('../src/services/storage');
const { analyzeAudio } = require('../src/services/analysis');
const { connectMongo } = require('../src/db/connection');
const Submission = require('../src/models/Submission');
const GoatScream = require('../src/models/GoatScream');
const app = require('../src/app');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

describe('Submission pipeline', () => {
  let mongo;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    const uri = mongo.getUri();
    process.env.MONGODB_URI = uri;
    process.env.FULL_STACK = 'true';
    await connectMongo({ uri });
  });

  afterAll(async () => {
    await mongoose.connection.close();
    if (mongo) await mongo.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    axios.mockImplementation(() =>
      Promise.resolve({ data: Readable.from(Buffer.from('fake-audio')) })
    );
  });

  afterEach(async () => {
    await Submission.deleteMany({});
    await GoatScream.deleteMany({});
  });

  it('accepts submissions (JSON with remote audio and multipart with file upload)', async () => {
    // JSON submission with remote audio
    const res1 = await request(app)
      .post('/api/v1/submissions')
      .send({ title: 'Remote Goat', audio_url: 'https://example.com/audio.mp3' })
      .expect(202);
    expect(res1.body.submission).toHaveProperty('id');
    expect(uploadSubmissionAudio).toHaveBeenCalledTimes(1);
    expect(analyzeAudio).toHaveBeenCalled();
    const docs1 = await Submission.find();
    expect(docs1).toHaveLength(1);
    expect(docs1[0].status).toBe('pending_review');

    // Multipart submission
    const res2 = await request(app)
      .post('/api/v1/submissions')
      .attach('audio', Buffer.from('goat scream'), 'goat.mp3')
      .field('title', 'Multipart Goat')
      .field('context', 'User recorded clip')
      .expect(202);
    expect(res2.body.submission.status).toBe('pending_review');
    expect(uploadSubmissionAudio).toHaveBeenCalledTimes(2);
    const doc2 = await Submission.findOne({ id: res2.body.submission.id });
    expect(doc2).not.toBeNull();
    expect(doc2.title).toBe('Multipart Goat');
  });

  it('approves submissions and promotes to GoatScream (basic and full flow)', async () => {
    // Basic approval
    const submissionRes1 = await request(app)
      .post('/api/v1/submissions')
      .send({ title: 'Goat Clip', audio_url: 'https://example.com/audio.mp3' })
      .expect(202);
    const submissionId1 = submissionRes1.body.submission.id;
    const approveRes1 = await request(app)
      .patch(`/api/v1/moderation/submissions/${submissionId1}/approve`)
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ meme_status: 'classic', tags: 'approved,goat' })
      .expect(200);
    expect(approveRes1.body).toHaveProperty('goat_scream_id');
    expect(promoteSubmissionAudio).toHaveBeenCalledTimes(1);
    const goatDoc1 = await GoatScream.findOne({ id: approveRes1.body.goat_scream_id });
    expect(goatDoc1).not.toBeNull();
    expect(goatDoc1.approved).toBe(true);
    expect(goatDoc1.tags).toContain('approved');
    const updatedSubmission1 = await Submission.findOne({ id: submissionId1 });
    expect(updatedSubmission1.status).toBe('approved');

    // Full flow: submit → view in queue → approve → verify in /api/screams
    const submissionRes2 = await request(app)
      .post('/api/v1/submissions')
      .send({ title: 'Full Flow Test', audio_url: 'https://example.com/audio.mp3', year: 2023 })
      .expect(202);
    const submissionId2 = submissionRes2.body.submission.id;
    const queueRes = await request(app)
      .get('/api/v1/moderation/submissions')
      .set('x-admin-token', ADMIN_TOKEN)
      .query({ status: 'pending_review' })
      .expect(200);
    expect(queueRes.body.items.find(s => s.id === submissionId2)).toBeDefined();
    const approveRes2 = await request(app)
      .patch(`/api/v1/moderation/submissions/${submissionId2}/approve`)
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ meme_status: 'classic', tags: 'test,approved' })
      .expect(200);
    const goatScreamId = approveRes2.body.goat_scream_id;
    const screamsRes = await request(app)
      .get('/api/v1/screams')
      .query({ year: '2023' })
      .expect(200);
    const approvedScream = screamsRes.body.items.find(s => s.id === goatScreamId);
    expect(approvedScream).toBeDefined();
    expect(approvedScream.approved).toBe(true);
    expect(approvedScream.meme_status).toBe('classic');
    expect(approvedScream.tags).toContain('test');
  });

  it('rejects submissions (basic, full flow, delete_media flag)', async () => {
    // Basic rejection with delete (default)
    const submissionRes1 = await request(app)
      .post('/api/v1/submissions')
      .send({ title: 'Reject Me', audio_url: 'https://example.com/audio.mp3' })
      .expect(202);
    const submissionId1 = submissionRes1.body.submission.id;
    await request(app)
      .patch(`/api/v1/moderation/submissions/${submissionId1}/reject`)
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ review_notes: 'No goat audio' })
      .expect(200);
    expect(deleteSubmissionAudio).toHaveBeenCalled();
    const updatedSubmission1 = await Submission.findOne({ id: submissionId1 });
    expect(updatedSubmission1.status).toBe('rejected');
    expect(updatedSubmission1.review_notes).toBe('No goat audio');

    // Full flow: submit → reject → verify reason and not in /api/screams
    const submissionRes2 = await request(app)
      .post('/api/v1/submissions')
      .send({ title: 'Rejection Test', audio_url: 'https://example.com/audio.mp3' })
      .expect(202);
    const submissionId2 = submissionRes2.body.submission.id;
    const rejectionReason = 'Audio quality too poor for our collection';
    await request(app)
      .patch(`/api/v1/moderation/submissions/${submissionId2}/reject`)
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ review_notes: rejectionReason })
      .expect(200);
    const updatedSubmission2 = await Submission.findOne({ id: submissionId2 });
    expect(updatedSubmission2.status).toBe('rejected');
    expect(updatedSubmission2.review_notes).toBe(rejectionReason);
    const screamsRes = await request(app).get('/api/v1/screams').expect(200);
    expect(screamsRes.body.items.find(s => s.id === submissionId2)).toBeUndefined();

    // Reject without deleting media
    const submissionRes3 = await request(app)
      .post('/api/v1/submissions')
      .send({ title: 'Keep Asset Test', audio_url: 'https://example.com/audio.mp3' })
      .expect(202);
    const submissionId3 = submissionRes3.body.submission.id;
    const originalPublicId = (await Submission.findOne({ id: submissionId3 })).cloudinary_public_id;
    const callCountBefore = deleteSubmissionAudio.mock.calls.length;
    await request(app)
      .patch(`/api/v1/moderation/submissions/${submissionId3}/reject`)
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ review_notes: 'Keep for reference', delete_media: false })
      .expect(200);
    expect(deleteSubmissionAudio.mock.calls.length).toBe(callCountBefore); // Should not increase
    const updatedSubmission3 = await Submission.findOne({ id: submissionId3 });
    expect(updatedSubmission3.status).toBe('rejected');
    expect(updatedSubmission3.cloudinary_public_id).toBe(originalPublicId);
  });

  it('validates submissions (missing title, invalid year, missing audio)', async () => {
    // Missing title
    const res1 = await request(app)
      .post('/api/v1/submissions')
      .send({ audio_url: 'https://example.com/audio.mp3' })
      .expect(400);
    expect(res1.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(res1.body.error.details).toContain('title is required (min 3 chars)');

    // Invalid year
    const res2 = await request(app)
      .post('/api/v1/submissions')
      .send({ title: 'Test', audio_url: 'https://example.com/audio.mp3', year: 1800 })
      .expect(400);
    expect(res2.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(res2.body.error.details.some(e => e.includes('year'))).toBe(true);

    // Missing audio
    const res3 = await request(app).post('/api/v1/submissions').send({ title: 'Test' }).expect(400);
    expect(res3.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(res3.body.error.details.some(e => e.includes('audio'))).toBe(true);
  });

  it('handles errors gracefully (Cloudinary upload failure, analysis failure)', async () => {
    // Cloudinary upload failure
    uploadSubmissionAudio.mockRejectedValueOnce(new Error('Cloudinary upload failed'));
    const res1 = await request(app)
      .post('/api/v1/submissions')
      .send({ title: 'Cloudinary Fail', audio_url: 'https://example.com/audio.mp3' })
      .expect(502);
    expect(res1.body.error).toHaveProperty('code', 'EXTERNAL_SERVICE_ERROR');
    expect(res1.body.error.message).toBe('Failed to process submission');

    // Analysis failure
    analyzeAudio.mockRejectedValueOnce(new Error('Analysis failed'));
    const res2 = await request(app)
      .post('/api/v1/submissions')
      .send({ title: 'Analysis Fail', audio_url: 'https://example.com/audio.mp3' })
      .expect(502);
    expect(res2.body.error).toHaveProperty('code', 'EXTERNAL_SERVICE_ERROR');
    expect(res2.body.error.message).toBe('Failed to process submission');
  });

  it('tracks stats correctly after approval', async () => {
    const submissionRes = await request(app)
      .post('/api/v1/submissions')
      .send({ title: 'Stats Test', audio_url: 'https://example.com/audio.mp3' })
      .expect(202);

    const submissionId = submissionRes.body.submission.id;

    const approveRes = await request(app)
      .patch(`/api/v1/moderation/submissions/${submissionId}/approve`)
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ meme_status: 'classic' })
      .expect(200);

    const goatScreamId = approveRes.body.goat_scream_id;
    const goatScream = await GoatScream.findOne({ id: goatScreamId });

    expect(goatScream.stats).toBeDefined();
    expect(goatScream.stats.api_calls).toBe(0); // Initial value
    expect(goatScream.stats.downloads).toBe(0);
    expect(goatScream.stats.favorites).toBe(0);
  });

  it('lists moderation queue with filters', async () => {
    // Create multiple submissions with different statuses
    const sub1 = await request(app)
      .post('/api/v1/submissions')
      .send({ title: 'Pending 1', audio_url: 'https://example.com/audio1.mp3' })
      .expect(202);

    await request(app)
      .post('/api/v1/submissions')
      .send({ title: 'Pending 2', audio_url: 'https://example.com/audio2.mp3' })
      .expect(202);

    // Approve one
    await request(app)
      .patch(`/api/v1/moderation/submissions/${sub1.body.submission.id}/approve`)
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ meme_status: 'classic' })
      .expect(200);

    // List pending
    const pendingRes = await request(app)
      .get('/api/v1/moderation/submissions')
      .set('x-admin-token', ADMIN_TOKEN)
      .query({ status: 'pending_review' })
      .expect(200);

    expect(pendingRes.body.items.every(s => s.status === 'pending_review')).toBe(true);
    expect(pendingRes.body.items.find(s => s.id === sub1.body.submission.id)).toBeUndefined();

    // List approved
    const approvedRes = await request(app)
      .get('/api/v1/moderation/submissions')
      .set('x-admin-token', ADMIN_TOKEN)
      .query({ status: 'approved' })
      .expect(200);

    expect(approvedRes.body.items.every(s => s.status === 'approved')).toBe(true);
    expect(approvedRes.body.items.find(s => s.id === sub1.body.submission.id)).toBeDefined();

    // List all
    const allRes = await request(app)
      .get('/api/v1/moderation/submissions')
      .set('x-admin-token', ADMIN_TOKEN)
      .query({ status: 'all' })
      .expect(200);

    expect(allRes.body.total).toBeGreaterThanOrEqual(2);
  });

  it('prevents state changes on already approved submissions (approve twice, reject after approve)', async () => {
    // Prevent double approval
    const submissionRes1 = await request(app)
      .post('/api/v1/submissions')
      .send({ title: 'Double Approve Test', audio_url: 'https://example.com/audio.mp3' })
      .expect(202);
    const submissionId1 = submissionRes1.body.submission.id;

    // First approval
    await request(app)
      .patch(`/api/v1/moderation/submissions/${submissionId1}/approve`)
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ meme_status: 'classic' })
      .expect(200);

    // Second approval attempt (should fail)
    await request(app)
      .patch(`/api/v1/moderation/submissions/${submissionId1}/approve`)
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ meme_status: 'classic' })
      .expect(400);
    expect(promoteSubmissionAudio).toHaveBeenCalledTimes(1);

    // Prevent rejecting after approval
    const submissionRes2 = await request(app)
      .post('/api/v1/submissions')
      .send({ title: 'Reject Approved Test', audio_url: 'https://example.com/audio2.mp3' })
      .expect(202);
    const submissionId2 = submissionRes2.body.submission.id;

    // Approve first
    await request(app)
      .patch(`/api/v1/moderation/submissions/${submissionId2}/approve`)
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ meme_status: 'classic' })
      .expect(200);

    // Try to reject (should fail)
    await request(app)
      .patch(`/api/v1/moderation/submissions/${submissionId2}/reject`)
      .set('x-admin-token', ADMIN_TOKEN)
      .send({ review_notes: 'Oops' })
      .expect(400);
  });
});
