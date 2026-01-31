// Mock db/connection module before requiring services
jest.mock('../../src/db/connection', () => ({
  getDbStatus: jest.fn(() => ({ connected: true })),
  connectMongo: jest.fn(),
}));

// Mock stats utils to avoid Mongoose calls
jest.mock('../../src/utils/stats', () => ({
  recordAccess: jest.fn(() => Promise.resolve()),
}));

const SearchService = require('../../src/services/searchService');
const { ValidationError } = require('../../src/errors');
const dbConnection = require('../../src/db/connection');
const staticScreams = require('../../src/utils/staticScreams');
const statsUtils = require('../../src/utils/stats');

describe('SearchService', () => {
  let service;
  let mockRepository;

  beforeEach(() => {
    // Create mock repository
    mockRepository = {
      find: jest.fn(),
      count: jest.fn(),
    };

    // Create service with mocked repository
    service = new SearchService(mockRepository);

    // Mock getDbStatus to return connected (MongoDB mode)
    dbConnection.getDbStatus.mockReturnValue({ connected: true });
    // Reset recordAccess mock
    statsUtils.recordAccess.mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('searchScreams (MongoDB mode)', () => {
    it('should search with text query', async () => {
      const mockResults = [{ id: '1', title: 'Test Scream' }];
      mockRepository.find.mockResolvedValue(mockResults);
      mockRepository.count.mockResolvedValue(1);

      const result = await service.searchScreams({ q: 'test' });

      expect(result).toHaveProperty('items', mockResults);
      expect(result).toHaveProperty('total', 1);
      expect(mockRepository.find).toHaveBeenCalled();
    });

    it('should handle intensity range', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      await service.searchScreams({ intensity_range: '5-10' });

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          'audio.intensity': expect.objectContaining({
            $gte: 5,
            $lte: 10,
          }),
        }),
        expect.any(Object)
      );
    });

    it('should handle duration range', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      await service.searchScreams({ duration_range: '1-5' });

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          'audio.duration': expect.objectContaining({
            $gte: 1,
            $lte: 5,
          }),
        }),
        expect.any(Object)
      );
    });

    it('should handle year range', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      await service.searchScreams({ years: '2020-2023' });

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          year: expect.objectContaining({
            $gte: 2020,
            $lte: 2023,
          }),
        }),
        expect.any(Object)
      );
    });

    it('should handle tags filter', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      await service.searchScreams({ tags: 'viral,funny' });

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $and: expect.arrayContaining([
            expect.objectContaining({
              tags: { $in: ['viral', 'funny'] },
            }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('should handle exclude_tags filter', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      await service.searchScreams({ exclude_tags: 'nsfw,boring' });

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $and: expect.arrayContaining([
            expect.objectContaining({
              tags: { $nin: ['nsfw', 'boring'] },
            }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('should handle has_video filter (true)', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      await service.searchScreams({ has_video: 'true' });

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $and: expect.arrayContaining([
            expect.objectContaining({
              'media.video': { $exists: true },
            }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('should handle has_video filter (false)', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      await service.searchScreams({ has_video: 'false' });

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $and: expect.arrayContaining([
            expect.objectContaining({
              'media.video': { $exists: false },
            }),
          ]),
        }),
        expect.any(Object)
      );
    });

    it('should handle pagination', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      const result = await service.searchScreams({ page: '2', limit: '50' });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          skip: 50,
          limit: 50,
        })
      );
    });

    it('should handle sorting by intensity', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      await service.searchScreams({ sort_by: 'intensity' });

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          sort: { 'audio.intensity': -1 },
        })
      );
    });

    it('should handle sorting by year', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      await service.searchScreams({ sort_by: 'year' });

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          sort: { year: -1 },
        })
      );
    });

    it('should handle sorting by duration', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      await service.searchScreams({ sort_by: 'duration' });

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          sort: { 'audio.duration': -1 },
        })
      );
    });

    it('should use relevance sorting by default', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      await service.searchScreams({});

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          sort: { remix_count: -1, date_added: -1 },
        })
      );
    });

    it('should throw ValidationError for invalid intensity_range format', async () => {
      await expect(service.searchScreams({ intensity_range: 'invalid' })).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for invalid duration_range format', async () => {
      await expect(service.searchScreams({ duration_range: 'invalid' })).rejects.toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for invalid years format', async () => {
      await expect(service.searchScreams({ years: 'invalid' })).rejects.toThrow(ValidationError);
    });

    it('should cap limit at 100', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      await service.searchScreams({ limit: '200' });

      expect(mockRepository.find).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          limit: 100,
        })
      );
    });

    it('should use default pagination', async () => {
      mockRepository.find.mockResolvedValue([]);
      mockRepository.count.mockResolvedValue(0);

      const result = await service.searchScreams({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  describe('searchScreams (Static mode)', () => {
    beforeEach(() => {
      // Mock getDbStatus to return disconnected (static mode)
      dbConnection.getDbStatus.mockReturnValue({ connected: false });
    });

    it('should search static data with text query', async () => {
      // Mock getStaticScreams
      jest.spyOn(staticScreams, 'getStaticScreams').mockReturnValue([
        {
          id: '1',
          title: 'Test Scream',
          approved: true,
          audio: { intensity: 5, duration: 2 },
          year: 2020,
          tags: ['test'],
        },
      ]);

      const result = await service.searchScreams({ q: 'test' });

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result.items.length).toBeGreaterThan(0);
    });

    it('should filter static data by intensity range', async () => {
      jest.spyOn(staticScreams, 'getStaticScreams').mockReturnValue([
        {
          id: '1',
          audio: { intensity: 5, duration: 2 },
          approved: true,
          year: 2020,
        },
        {
          id: '2',
          audio: { intensity: 10, duration: 3 },
          approved: true,
          year: 2020,
        },
      ]);

      const result = await service.searchScreams({ intensity_range: '5-7' });

      expect(result.items.every(s => s.audio.intensity >= 5 && s.audio.intensity <= 7)).toBe(true);
    });
  });
});
