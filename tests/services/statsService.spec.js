// Mock db/connection module before requiring services
jest.mock('../../src/db/connection', () => ({
  getDbStatus: jest.fn(() => ({ connected: true })),
  connectMongo: jest.fn(),
}));

// Mock staticScreams module
const mockGetStaticScreams = jest.fn();
jest.mock('../../src/utils/staticScreams', () => ({
  getStaticScreams: mockGetStaticScreams,
  reloadStaticScreams: jest.fn(),
  getStaticSource: jest.fn(),
}));

const StatsService = require('../../src/services/statsService');
const cache = require('../../src/services/cache');
const dbConnection = require('../../src/db/connection');

describe('StatsService', () => {
  let service;
  let mockRepository;

  beforeEach(() => {
    // Create mock repository
    mockRepository = {
      count: jest.fn(),
      aggregate: jest.fn(),
    };

    // Create service with mocked repository
    service = new StatsService(mockRepository);

    // Mock cache
    jest.spyOn(cache, 'get').mockResolvedValue(null);
    jest.spyOn(cache, 'set').mockResolvedValue();

    // Mock getDbStatus to return connected (MongoDB mode)
    dbConnection.getDbStatus.mockReturnValue({ connected: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getStats (MongoDB mode)', () => {
    it('should return cached stats if available', async () => {
      const cachedStats = {
        total_screams: 100,
        by_year: { 2020: 50, 2021: 50 },
        by_source_type: { viral_video: 80, movie: 20 },
        intensity_distribution: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
        top_tags: [{ tag: 'viral', count: 50 }],
      };
      cache.get.mockResolvedValue(cachedStats);

      const result = await service.getStats();

      expect(result).toEqual(cachedStats);
      expect(mockRepository.count).not.toHaveBeenCalled();
    });

    it('should fetch and cache stats from MongoDB', async () => {
      mockRepository.count.mockResolvedValue(100);
      mockRepository.aggregate
        .mockResolvedValueOnce([
          { _id: 2020, count: 50 },
          { _id: 2021, count: 50 },
        ])
        .mockResolvedValueOnce([
          { _id: 'viral_video', count: 80 },
          { _id: 'movie', count: 20 },
        ])
        .mockResolvedValueOnce([
          { _id: 5, count: 30 },
          { _id: 8, count: 40 },
        ])
        .mockResolvedValueOnce([{ _id: 'viral', count: 50 }]);

      const result = await service.getStats();

      expect(result).toHaveProperty('total_screams', 100);
      expect(result).toHaveProperty('by_year');
      expect(result).toHaveProperty('by_source_type');
      expect(result).toHaveProperty('intensity_distribution');
      expect(result).toHaveProperty('top_tags');
      expect(mockRepository.count).toHaveBeenCalled();
      expect(mockRepository.aggregate).toHaveBeenCalledTimes(4);
      expect(cache.set).toHaveBeenCalled();
    });

    it('should calculate intensity distribution correctly', async () => {
      mockRepository.count.mockResolvedValue(10);
      mockRepository.aggregate
        .mockResolvedValueOnce([]) // byYear
        .mockResolvedValueOnce([]) // bySourceType
        .mockResolvedValueOnce([
          { _id: 1, count: 2 },
          { _id: 5, count: 3 },
          { _id: 10, count: 5 },
        ])
        .mockResolvedValueOnce([]); // topTags

      const result = await service.getStats();

      expect(result.intensity_distribution).toHaveLength(10);
      expect(result.intensity_distribution[0]).toBe(2); // intensity 1
      expect(result.intensity_distribution[4]).toBe(3); // intensity 5
      expect(result.intensity_distribution[9]).toBe(5); // intensity 10
    });

    it('should format top tags correctly', async () => {
      mockRepository.count.mockResolvedValue(10);
      mockRepository.aggregate
        .mockResolvedValueOnce([]) // byYear
        .mockResolvedValueOnce([]) // bySourceType
        .mockResolvedValueOnce([]) // intensity
        .mockResolvedValueOnce([
          { _id: 'viral', count: 50 },
          { _id: 'funny', count: 30 },
        ]);

      const result = await service.getStats();

      expect(result.top_tags).toEqual([
        { tag: 'viral', count: 50 },
        { tag: 'funny', count: 30 },
      ]);
    });

    it('should handle null year values', async () => {
      mockRepository.count.mockResolvedValue(10);
      mockRepository.aggregate
        .mockResolvedValueOnce([
          { _id: 2020, count: 5 },
          { _id: null, count: 5 },
        ])
        .mockResolvedValueOnce([]) // bySourceType
        .mockResolvedValueOnce([]) // intensity
        .mockResolvedValueOnce([]); // topTags

      const result = await service.getStats();

      expect(result.by_year[2020]).toBe(5);
      expect(result.by_year).not.toHaveProperty('null');
    });
  });

  describe('getStats (Static mode)', () => {
    beforeEach(() => {
      // Mock getDbStatus to return disconnected (static mode)
      dbConnection.getDbStatus.mockReturnValue({ connected: false });
      // Mock getStaticScreams to return test data
      mockGetStaticScreams.mockReturnValue([
        {
          id: '1',
          year: 2020,
          source_type: 'viral_video',
          audio: { intensity: 5 },
          tags: ['viral', 'funny'],
          approved: true,
        },
        {
          id: '2',
          year: 2021,
          source_type: 'movie',
          audio: { intensity: 8 },
          tags: ['viral'],
          approved: true,
        },
      ]);
    });

    it('should calculate stats from static data', async () => {
      const result = await service.getStats();

      expect(result).toHaveProperty('total_screams', 2);
      expect(result).toHaveProperty('by_year');
      expect(result.by_year[2020]).toBe(1);
      expect(result.by_year[2021]).toBe(1);
      expect(result).toHaveProperty('by_source_type');
      expect(result.by_source_type.viral_video).toBe(1);
      expect(result.by_source_type.movie).toBe(1);
      expect(result).toHaveProperty('intensity_distribution');
      expect(result.intensity_distribution).toHaveLength(10);
      expect(result).toHaveProperty('top_tags');
      expect(result.top_tags.length).toBeGreaterThan(0);
    });

    it('should handle missing audio intensity', async () => {
      mockGetStaticScreams.mockReturnValue([
        {
          id: '1',
          year: 2020,
          source_type: 'viral_video',
          approved: true,
        },
      ]);

      const result = await service.getStats();

      expect(result.intensity_distribution).toHaveLength(10);
      // Should default to 0 (or handle gracefully)
    });

    it('should limit top tags to 10', async () => {
      const manyScreams = Array.from({ length: 20 }, (_, i) => ({
        id: `scream-${i}`,
        year: 2020,
        source_type: 'viral_video',
        audio: { intensity: 5 },
        tags: [`tag-${i}`],
        approved: true,
      }));
      mockGetStaticScreams.mockReturnValue(manyScreams);

      const result = await service.getStats();

      expect(result.top_tags.length).toBeLessThanOrEqual(10);
    });
  });
});
