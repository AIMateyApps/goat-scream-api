const {
  uploadSubmissionAudio,
  promoteSubmissionAudio,
  deleteSubmissionAudio,
} = require('../../src/services/storage');
const { uploadAudio, renameAsset, deleteAsset } = require('../../src/services/cloudinary');

jest.mock('../../src/services/cloudinary');

describe('storage service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadSubmissionAudio', () => {
    it('should upload audio with correct prefix, tags, context, and URL fallback', async () => {
      // Basic upload with tags and context
      uploadAudio.mockResolvedValueOnce({
        public_id: 'goat-screams/submissions/test-id',
        secure_url: 'https://res.cloudinary.com/test.mp3',
        duration: 2.5,
        bytes: 1024,
        format: 'mp3',
      });

      const result1 = await uploadSubmissionAudio('/path/to/file.mp3', 'test-id', {
        tags: ['custom-tag'],
        context: { title: 'Test' },
      });

      expect(uploadAudio).toHaveBeenCalledWith('/path/to/file.mp3', {
        publicId: 'goat-screams/submissions/test-id',
        tags: ['submission', 'custom-tag'],
        context: { title: 'Test' },
      });
      expect(result1).toEqual({
        publicId: 'goat-screams/submissions/test-id',
        url: 'https://res.cloudinary.com/test.mp3',
        duration: 2.5,
        bytes: 1024,
        format: 'mp3',
      });

      // Empty tags and context
      uploadAudio.mockResolvedValueOnce({
        public_id: 'goat-screams/submissions/test-id-2',
        url: 'https://res.cloudinary.com/test2.mp3',
        duration: 2.5,
        bytes: 1024,
        format: 'mp3',
      });

      await uploadSubmissionAudio('/path/to/file2.mp3', 'test-id-2');

      expect(uploadAudio).toHaveBeenCalledWith('/path/to/file2.mp3', {
        publicId: 'goat-screams/submissions/test-id-2',
        tags: ['submission'],
        context: {},
      });

      // URL fallback (no secure_url)
      uploadAudio.mockResolvedValueOnce({
        public_id: 'goat-screams/submissions/test-id-3',
        url: 'http://res.cloudinary.com/test3.mp3',
        duration: 2.5,
      });

      const result3 = await uploadSubmissionAudio('/path/to/file3.mp3', 'test-id-3');
      expect(result3.url).toBe('http://res.cloudinary.com/test3.mp3');
    });
  });

  describe('promoteSubmissionAudio', () => {
    it('should rename asset from submission to main prefix (with URL fallback)', async () => {
      // Basic promotion with secure_url
      renameAsset.mockResolvedValueOnce({
        public_id: 'goat-screams/audio/goat-scream-id',
        secure_url: 'https://res.cloudinary.com/promoted.mp3',
      });

      const result1 = await promoteSubmissionAudio(
        'goat-screams/submissions/sub-id',
        'goat-scream-id'
      );

      expect(renameAsset).toHaveBeenCalledWith(
        'goat-screams/submissions/sub-id',
        'goat-screams/audio/goat-scream-id'
      );
      expect(result1).toEqual({
        publicId: 'goat-screams/audio/goat-scream-id',
        url: 'https://res.cloudinary.com/promoted.mp3',
      });

      // URL fallback (no secure_url)
      renameAsset.mockResolvedValueOnce({
        public_id: 'goat-screams/audio/goat-scream-id-2',
        url: 'http://res.cloudinary.com/promoted2.mp3',
      });

      const result2 = await promoteSubmissionAudio('sub-id-2', 'goat-scream-id-2');
      expect(result2.url).toBe('http://res.cloudinary.com/promoted2.mp3');
    });
  });

  describe('deleteSubmissionAudio', () => {
    it('should delete asset when publicId provided, return null for null/undefined', async () => {
      // Valid publicId
      deleteAsset.mockResolvedValueOnce({ result: 'ok' });

      const result1 = await deleteSubmissionAudio('goat-screams/submissions/test-id');

      expect(deleteAsset).toHaveBeenCalledWith('goat-screams/submissions/test-id');
      expect(result1).toEqual({ result: 'ok' });

      // Null publicId (should not call deleteAsset)
      const callCountBefore = deleteAsset.mock.calls.length;
      const result2 = await deleteSubmissionAudio(null);
      expect(deleteAsset.mock.calls.length).toBe(callCountBefore); // Should not increase
      expect(result2).toBeNull();

      // Undefined publicId (should not call deleteAsset)
      const result3 = await deleteSubmissionAudio(undefined);
      expect(deleteAsset.mock.calls.length).toBe(callCountBefore); // Should not increase
      expect(result3).toBeNull();
    });
  });
});
