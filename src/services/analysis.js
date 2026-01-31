// Mocked audio analysis service for submissions
// Returns pseudo-random but deterministic-ish characteristics

function pickCategory({ duration, intensity }) {
  if (duration >= 3.0 && intensity >= 7) return 'prolonged';
  if (duration >= 2.0 && intensity <= 5) return 'melodic';
  if (duration < 2.0 && intensity >= 7) return 'short_burst';
  return 'multiple';
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

async function analyzeAudio(inputPathOrUrl) {
  // NOTE: This is a stub. In the real pipeline we'd load the audio and analyze it.
  // For now we generate plausible characteristics.
  const duration = Number(randomBetween(1.0, 4.0).toFixed(2));
  const intensity = Math.floor(randomBetween(3, 10));
  const peak_decibels = Number(randomBetween(-10, -1).toFixed(2));
  const dominant_frequency = Math.floor(randomBetween(150, 650));

  const analysis = {
    duration,
    intensity,
    peak_decibels,
    dominant_frequency,
    category: pickCategory({ duration, intensity }),
    source: typeof inputPathOrUrl === 'string' ? inputPathOrUrl : 'unknown',
  };

  return analysis;
}

module.exports = { analyzeAudio };
