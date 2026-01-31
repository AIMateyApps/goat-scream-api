#!/usr/bin/env node

// fetch is a built-in global in Node.js 20+

async function check(path, options = {}) {
  const res = await fetch(`http://localhost:3000${path}`, options);
  if (!res.ok) {
    throw new Error(`${path} -> ${res.status} ${res.statusText}`);
  }
  return res.json();
}

(async () => {
  try {
    const health = await check('/health');
    const requireDb = process.env.SMOKE_REQUIRE_DB === 'true';
    if (requireDb && !health.db?.connected) throw new Error('Database disconnected');
    if (health.submissions?.pending > 100) throw new Error('Pending submissions exceed threshold');

    const random = await check('/api/screams/random?results=1');
    if (!random || (Array.isArray(random) && !random.length))
      throw new Error('Random endpoint returned no data');

    const search = await check('/api/search?q=goat');
    if (typeof search.total !== 'number') throw new Error('Search response missing total');

    const stats = await check('/api/stats');
    if (!stats || typeof stats.total_screams !== 'number') throw new Error('Stats payload invalid');

    console.log('Smoke test passed');
    process.exit(0);
  } catch (err) {
    console.error('Smoke test failed:', err.message);
    process.exit(1);
  }
})();
