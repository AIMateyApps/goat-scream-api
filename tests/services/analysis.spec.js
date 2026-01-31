const { analyzeAudio } = require('../../src/services/analysis');

describe('analysis service', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockRestore();
  });

  it('should return complete analysis with all properties and handle source (string vs non-string)', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const result = await analyzeAudio('/path/to/audio.mp3');

    // All required properties
    expect(result).toHaveProperty('duration');
    expect(result).toHaveProperty('intensity');
    expect(result).toHaveProperty('peak_decibels');
    expect(result).toHaveProperty('dominant_frequency');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('source');

    // Value ranges
    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(1.0);
    expect(result.duration).toBeLessThanOrEqual(4.0);

    expect(typeof result.intensity).toBe('number');
    expect(result.intensity).toBeGreaterThanOrEqual(3);
    expect(result.intensity).toBeLessThanOrEqual(10);

    expect(['short_burst', 'prolonged', 'melodic', 'multiple']).toContain(result.category);

    // Source handling
    expect(result.source).toBe('/path/to/audio.mp3');

    // Non-string source
    const result2 = await analyzeAudio(null);
    expect(result2.source).toBe('unknown');
  });

  it('should categorize audio correctly (prolonged, melodic, short_burst, multiple)', async () => {
    // Prolonged: long, intense
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.9) // duration ~3.7
      .mockReturnValueOnce(0.8); // intensity ~8.6 -> 8
    const result1 = await analyzeAudio('/test1.mp3');
    expect(result1.category).toBe('prolonged');

    // Melodic: medium duration, low intensity
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.5) // duration ~2.5
      .mockReturnValueOnce(0.2); // intensity ~4.4 -> 4
    const result2 = await analyzeAudio('/test2.mp3');
    expect(result2.category).toBe('melodic');

    // Short burst: short, intense
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.1) // duration ~1.3
      .mockReturnValueOnce(0.9); // intensity ~9.3 -> 9
    const result3 = await analyzeAudio('/test3.mp3');
    expect(result3.category).toBe('short_burst');

    // Multiple: default category
    jest
      .spyOn(Math, 'random')
      .mockReturnValueOnce(0.3) // duration ~1.9
      .mockReturnValueOnce(0.5); // intensity ~6.5 -> 6
    const result4 = await analyzeAudio('/test4.mp3');
    expect(result4.category).toBe('multiple');
  });

  it('should return peak_decibels and dominant_frequency in valid ranges', async () => {
    const result = await analyzeAudio('/test.mp3');

    expect(result.peak_decibels).toBeGreaterThanOrEqual(-10);
    expect(result.peak_decibels).toBeLessThanOrEqual(-1);

    expect(result.dominant_frequency).toBeGreaterThanOrEqual(150);
    expect(result.dominant_frequency).toBeLessThanOrEqual(650);
  });
});
