jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn(),
      rename: jest.fn(),
      destroy: jest.fn(),
    },
    api: {
      resource: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const cloudinary = require('cloudinary').v2;
const {
  uploadAudio,
  getAsset,
  renameAsset,
  deleteAsset,
  updateAssetMetadata,
} = require('../../src/services/cloudinary');

describe('cloudinary service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      CLOUDINARY_CLOUD_NAME: 'test-cloud',
      CLOUDINARY_API_KEY: 'test-key',
      CLOUDINARY_API_SECRET: 'test-secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('sanitizeContext (tested via uploadAudio)', () => {
    it('should sanitize context: remove newlines, nulls, truncate, and handle empty', async () => {
      cloudinary.uploader.upload.mockResolvedValue({
        public_id: 'test-id',
        secure_url: 'https://res.cloudinary.com/test.mp3',
      });

      // Test newline removal
      await uploadAudio('/path/to/file1.mp3', {
        publicId: 'test-1',
        context: { description: 'Test\nDescription' },
      });
      expect(cloudinary.uploader.upload.mock.calls[0][1].context.description).toBe(
        'Test Description'
      );

      // Test null/empty removal and truncation
      const longValue = 'a'.repeat(2000);
      await uploadAudio('/path/to/file2.mp3', {
        publicId: 'test-2',
        context: {
          title: 'Test',
          empty: '',
          nullValue: null,
          long: longValue,
        },
      });
      const callArgs = cloudinary.uploader.upload.mock.calls[1][1];
      expect(callArgs.context.title).toBe('Test');
      expect(callArgs.context.empty).toBeUndefined();
      expect(callArgs.context.nullValue).toBeUndefined();
      expect(callArgs.context.long.length).toBe(1000);

      // Test empty context returns undefined
      await uploadAudio('/path/to/file3.mp3', {
        publicId: 'test-3',
        context: {},
      });
      expect(cloudinary.uploader.upload.mock.calls[2][1].context).toBeUndefined();
    });
  });

  describe('uploadAudio', () => {
    it('should configure cloudinary and upload (handles context and empty context)', async () => {
      cloudinary.uploader.upload.mockResolvedValue({
        public_id: 'test-id',
        secure_url: 'https://res.cloudinary.com/test.mp3',
      });

      // Test upload with context
      const result = await uploadAudio('/path/to/file.mp3', {
        publicId: 'test-id',
        tags: ['tag1'],
        context: { title: 'Test' },
      });
      expect(cloudinary.uploader.upload).toHaveBeenCalledWith('/path/to/file.mp3', {
        resource_type: 'video',
        public_id: 'test-id',
        overwrite: false,
        use_filename: false,
        unique_filename: false,
        folder: undefined,
        tags: ['tag1'],
        context: expect.objectContaining({ title: 'Test' }),
      });
      expect(result.public_id).toBe('test-id');

      // Test upload with empty context (should be undefined)
      await uploadAudio('/path/to/file2.mp3', {
        publicId: 'test-id-2',
        tags: [],
        context: {},
      });
      const callArgs = cloudinary.uploader.upload.mock.calls[1][1];
      expect(callArgs.context).toBeUndefined();
    });
  });

  describe('getAsset', () => {
    it('should return asset when found', async () => {
      const mockAsset = { public_id: 'test-id', url: 'https://test.mp3' };
      cloudinary.api.resource.mockResolvedValueOnce(mockAsset);

      const result = await getAsset('test-id');

      expect(cloudinary.api.resource).toHaveBeenCalledWith('test-id', {
        resource_type: 'video',
      });
      expect(result).toEqual(mockAsset);
    });

    it('should return null for 404 errors', async () => {
      const error = new Error('Not found');
      error.http_code = 404;
      cloudinary.api.resource.mockRejectedValueOnce(error);

      const result = await getAsset('nonexistent');

      expect(result).toBeNull();
    });

    it('should throw for other errors', async () => {
      const error = new Error('Server error');
      error.http_code = 500;
      cloudinary.api.resource.mockRejectedValueOnce(error);

      await expect(getAsset('test-id')).rejects.toThrow('Server error');
    });
  });

  describe('renameAsset', () => {
    it('should rename asset', async () => {
      cloudinary.uploader.rename.mockResolvedValueOnce({
        public_id: 'new-id',
        secure_url: 'https://res.cloudinary.com/new.mp3',
      });

      const result = await renameAsset('old-id', 'new-id');

      expect(cloudinary.uploader.rename).toHaveBeenCalledWith('old-id', 'new-id', {
        resource_type: 'video',
        overwrite: true,
      });
      expect(result.public_id).toBe('new-id');
    });

    it('should pass through options', async () => {
      cloudinary.uploader.rename.mockResolvedValueOnce({});

      await renameAsset('old-id', 'new-id', { custom: 'option' });

      expect(cloudinary.uploader.rename).toHaveBeenCalledWith('old-id', 'new-id', {
        resource_type: 'video',
        overwrite: true,
        custom: 'option',
      });
    });
  });

  describe('deleteAsset', () => {
    it('should delete asset', async () => {
      cloudinary.uploader.destroy.mockResolvedValueOnce({ result: 'ok' });

      const result = await deleteAsset('test-id');

      expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('test-id', {
        resource_type: 'video',
      });
      expect(result.result).toBe('ok');
    });
  });

  describe('updateAssetMetadata', () => {
    it('should update context and tags (deduplicates tags, handles empty arrays)', async () => {
      cloudinary.api.update.mockResolvedValue({ public_id: 'test-id' });

      // Test basic update with context and tags
      await updateAssetMetadata('test-id', {
        context: { title: 'Test' },
        tags: ['tag1', 'tag2'],
      });
      expect(cloudinary.api.update).toHaveBeenCalledWith('test-id', {
        resource_type: 'video',
        context: expect.objectContaining({ title: 'Test' }),
        tags: ['tag1', 'tag2'],
      });

      // Test tag deduplication
      await updateAssetMetadata('test-id', {
        tags: ['tag1', 'tag1', 'tag2'],
      });
      expect(cloudinary.api.update).toHaveBeenCalledWith('test-id', {
        resource_type: 'video',
        tags: ['tag1', 'tag2'],
      });

      // Test empty tags array (should be undefined)
      await updateAssetMetadata('test-id', { tags: [] });
      const callArgs = cloudinary.api.update.mock.calls[2][1];
      expect(callArgs.tags).toBeUndefined();
    });
  });
});
