// Mock db/connection module before requiring services
jest.mock('../../src/db/connection', () => ({
  getDbStatus: jest.fn(() => ({ connected: false })),
  connectMongo: jest.fn(),
}));

// Mock stats utils to avoid Mongoose calls
jest.mock('../../src/utils/stats', () => ({
  recordAccess: jest.fn(() => Promise.resolve()),
}));

const ScreamsService = require('../../src/services/screamsService');
const { NotFoundError, ValidationError } = require('../../src/errors');
const cache = require('../../src/services/cache');
const dbConnection = require('../../src/db/connection');
const statsUtils = require('../../src/utils/stats');

describe('ScreamsService', () => {
  let service;
  let mockRepository;

  beforeEach(() => {
    // Create mock repository
    mockRepository = {
      find: jest.fn(),
      findById: jest.fn(),
      findRandom: jest.fn(),
      count: jest.fn(),
      distinct: jest.fn(),
      aggregate: jest.fn(),
      updateOne: jest.fn(),
    };

    // Create service with mocked repository
    service = new ScreamsService(mockRepository);

    // Clear cache before each test
    jest.spyOn(cache, 'get').mockResolvedValue(null);
    jest.spyOn(cache, 'set').mockResolvedValue();
    jest.spyOn(cache, 'generateKey').mockReturnValue('test-cache-key');

    // Mock getDbStatus to return disconnected by default (most tests don't need DB)
    dbConnection.getDbStatus.mockReturnValue({ connected: false });
    // Reset recordAccess mock
    statsUtils.recordAccess.mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getScreams', () => {
    it('should return paginated screams', async () => {
      const mockScreams = [{ id: '1', title: 'Test' }];
      mockRepository.find.mockResolvedValue(mockScreams);
      mockRepository.count.mockResolvedValue(1);

      const result = await service.getScreams({ page: '1', limit: '10' });

      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 10);
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('totalPages', 1);
      expect(result).toHaveProperty('items', mockScreams);
      expect(mockRepository.find).toHaveBeenCalled();
      expect(mockRepository.count).toHaveBeenCalled();
    });

    it('should handle default pagination', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      const result = await service.getScreams({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
    });

    it('should handle include_unapproved flag', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      await service.getScreams({ include_unapproved: 'true' });

      expect(mockRepository.find).toHaveBeenCalled();
      expect(mockRepository.count).toHaveBeenCalled();
    });

    it('should cap limit at 500', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      const result = await service.getScreams({ limit: '1000' });

      expect(result.limit).toBe(500);
    });

    it('should handle eagerAll flag', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      const result = await service.getScreams({ all: 'true' });

      expect(result.limit).toBe(5000);
    });
  });

  describe('getRandomScreams', () => {
    it('should fetch random screams from repository (not cached)', async () => {
      const mockScreams = [{ id: '1' }];
      mockRepository.findRandom.mockResolvedValue(mockScreams);

      const result = await service.getRandomScreams({ results: '1' });

      expect(result).toEqual(mockScreams[0]);
      expect(mockRepository.findRandom).toHaveBeenCalled();
      // Random results are intentionally not cached to keep successive calls fresh
      expect(cache.get).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('should fetch and return random screams', async () => {
      const mockScreams = [{ id: '1', title: 'Test' }];
      mockRepository.findRandom.mockResolvedValue(mockScreams);

      const result = await service.getRandomScreams({ results: '1' });

      expect(result).toEqual(mockScreams[0]);
      expect(mockRepository.findRandom).toHaveBeenCalled();
      // Random results are not cached
      expect(cache.set).not.toHaveBeenCalled();
    });

    it('should return array when results > 1', async () => {
      const mockScreams = [{ id: '1' }, { id: '2' }];
      mockRepository.findRandom.mockResolvedValue(mockScreams);

      const result = await service.getRandomScreams({ results: '2' });

      expect(result).toEqual(mockScreams);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should throw NotFoundError when no screams available', async () => {
      mockRepository.findRandom.mockResolvedValue([]);

      await expect(service.getRandomScreams({ results: '1' })).rejects.toThrow(NotFoundError);
    });

    it('should sort results when sort parameter provided', async () => {
      const mockScreams = [
        { id: '1', audio: { intensity: 5 } },
        { id: '2', audio: { intensity: 10 } },
      ];
      mockRepository.findRandom.mockResolvedValue(mockScreams);

      const result = await service.getRandomScreams({
        results: '2',
        sort: 'intensity',
        direction: 'desc',
      });

      expect(result[0].audio.intensity).toBe(10);
      expect(result[1].audio.intensity).toBe(5);
    });

    it('should cap results at 50', async () => {
      const mockScreams = Array(100).fill({ id: '1' });
      mockRepository.findRandom.mockResolvedValue(mockScreams.slice(0, 50));

      await service.getRandomScreams({ results: '100' });

      expect(mockRepository.findRandom).toHaveBeenCalledWith(expect.any(Object), 50);
    });
  });

  describe('getScreamById', () => {
    it('should return scream by ID', async () => {
      const mockScream = { id: 'test-1', title: 'Test' };
      mockRepository.findById.mockResolvedValue(mockScream);

      const result = await service.getScreamById('test-1');

      expect(result).toEqual(mockScream);
      expect(mockRepository.findById).toHaveBeenCalledWith('test-1');
    });

    it('should throw NotFoundError when scream not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.getScreamById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getScreamByOrderedIndex', () => {
    beforeEach(() => {
      // Mock getDbStatus to return connected for these tests (override the default disconnected mock)
      dbConnection.getDbStatus.mockReturnValue({ connected: true });
    });

    it('should return single scream by index', async () => {
      const mockScream = { id: '1', title: 'Test' };
      mockRepository.find.mockResolvedValue([mockScream]);

      const result = await service.getScreamByOrderedIndex('5');

      expect(result).toEqual(mockScream);
      expect(mockRepository.find).toHaveBeenCalledWith(
        { approved: true },
        expect.objectContaining({
          sort: { date_added: 1 },
          skip: 5,
          limit: 1,
        })
      );
    });

    it('should return range of screams', async () => {
      const mockScreams = [{ id: '1' }, { id: '2' }, { id: '3' }];
      mockRepository.find.mockResolvedValue(mockScreams);

      const result = await service.getScreamByOrderedIndex('5-7');

      expect(result).toEqual(mockScreams);
      expect(Array.isArray(result)).toBe(true);
      expect(mockRepository.find).toHaveBeenCalledWith(
        { approved: true },
        expect.objectContaining({
          sort: { date_added: 1 },
          skip: 5,
          limit: 3,
        })
      );
    });

    it('should throw ValidationError for invalid index', async () => {
      // Ensure DB is connected so it goes through MongoDB path (which validates NaN)
      dbConnection.getDbStatus.mockReturnValue({ connected: true });

      await expect(service.getScreamByOrderedIndex('invalid')).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError when index out of range', async () => {
      mockRepository.find.mockResolvedValue([]);

      await expect(service.getScreamByOrderedIndex('999')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getIntenseScreams', () => {
    it('should return cached result if available', async () => {
      const cachedResult = [{ id: '1', intensity: 10 }];
      cache.get.mockResolvedValue(cachedResult);

      const result = await service.getIntenseScreams(10);

      expect(result).toEqual(cachedResult);
      expect(mockRepository.find).not.toHaveBeenCalled();
    });

    it('should fetch and cache intense screams', async () => {
      const mockScreams = [{ id: '1', 'audio.intensity': 10 }];
      mockRepository.find.mockResolvedValue(mockScreams);

      const result = await service.getIntenseScreams(10);

      expect(result).toEqual(mockScreams);
      expect(mockRepository.find).toHaveBeenCalledWith(
        { approved: true },
        expect.objectContaining({
          sort: { 'audio.intensity': -1 },
          limit: 10,
        })
      );
      expect(cache.set).toHaveBeenCalled();
    });

    it('should use default limit of 10', async () => {
      mockRepository.find.mockResolvedValue([]);

      await service.getIntenseScreams();

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ limit: 10 })
      );
    });
  });

  describe('getBreeds', () => {
    it('should return unique breeds', async () => {
      const mockBreeds = ['Alpine', 'Nubian', 'Saanen'];
      mockRepository.distinct.mockResolvedValue(mockBreeds);

      const result = await service.getBreeds();

      expect(result).toEqual(mockBreeds);
      expect(mockRepository.distinct).toHaveBeenCalledWith('goat.breed', {
        approved: true,
      });
    });

    it('should filter out empty/null breeds', async () => {
      const mockBreeds = ['Alpine', null, '', 'Nubian'];
      mockRepository.distinct.mockResolvedValue(mockBreeds);

      const result = await service.getBreeds();

      expect(result).toEqual(['Alpine', 'Nubian']);
    });
  });

  describe('getSources', () => {
    it('should return sources with counts', async () => {
      const mockSources = [
        { _id: 'YouTube', type: 'viral_video', count: 10 },
        { _id: 'Movie', type: 'movie', count: 5 },
      ];
      mockRepository.aggregate.mockResolvedValue(mockSources);

      const result = await service.getSources();

      expect(result).toEqual(mockSources);
      expect(mockRepository.aggregate).toHaveBeenCalled();
    });
  });

  describe('getDownloadUrl', () => {
    it('should return download URL for valid format and quality', async () => {
      const mockScream = {
        id: 'test-1',
        media: {
          audio: {
            mp3: {
              high: 'https://example.com/high.mp3',
              medium: 'https://example.com/medium.mp3',
              low: 'https://example.com/low.mp3',
            },
          },
        },
      };
      mockRepository.findById.mockResolvedValue(mockScream);
      mockRepository.updateOne.mockResolvedValue({ acknowledged: true });

      const result = await service.getDownloadUrl('test-1', 'mp3', 'medium');

      expect(result).toHaveProperty('download_url', 'https://example.com/medium.mp3');
      expect(result).toHaveProperty('format', 'mp3');
      expect(result).toHaveProperty('quality', 'medium');
      expect(result).toHaveProperty('filename', 'goat_scream_test-1.mp3');
    });

    it('should throw ValidationError for unsupported format', async () => {
      const mockScream = {
        id: 'test-1',
        media: { audio: {} },
      };
      mockRepository.findById.mockResolvedValue(mockScream);

      await expect(service.getDownloadUrl('test-1', 'wav', 'medium')).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for unsupported quality', async () => {
      const mockScream = {
        id: 'test-1',
        media: {
          audio: {
            mp3: {
              medium: 'https://example.com/medium.mp3',
            },
          },
        },
      };
      mockRepository.findById.mockResolvedValue(mockScream);

      await expect(service.getDownloadUrl('test-1', 'mp3', 'ultra')).rejects.toThrow(
        ValidationError
      );
    });

    it('should update download stats when connected to MongoDB', async () => {
      // Override the default disconnected mock to return connected
      dbConnection.getDbStatus.mockReturnValue({ connected: true });

      const mockScream = {
        id: 'test-1',
        media: {
          audio: {
            mp3: { medium: 'https://example.com/medium.mp3' },
          },
        },
      };
      mockRepository.findById.mockResolvedValue(mockScream);
      mockRepository.updateOne.mockResolvedValue({ acknowledged: true });

      await service.getDownloadUrl('test-1', 'mp3', 'medium');

      expect(mockRepository.updateOne).toHaveBeenCalledWith(
        { id: 'test-1' },
        expect.objectContaining({
          $inc: { 'stats.downloads': 1 },
        })
      );
    });
  });
});
