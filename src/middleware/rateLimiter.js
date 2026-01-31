const ApiKey = require('../models/ApiKey');
const { getDbStatus } = require('../db/connection');
const { RateLimitExceededError } = require('../errors');

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);

function getDefaultQuota() {
  return Number(process.env.RATE_LIMIT_MAX || 100);
}

function getTierDefaults() {
  const defaultQuota = getDefaultQuota();
  return {
    public: defaultQuota,
    basic: 200,
    pro: 600,
  };
}

const buckets = new Map();

function getBucket(identifier) {
  const now = Date.now();
  let bucket = buckets.get(identifier);
  if (!bucket || bucket.expiresAt <= now) {
    bucket = { count: 0, expiresAt: now + WINDOW_MS };
    buckets.set(identifier, bucket);
  }
  return bucket;
}

async function updateApiKeyUsage(apiKey) {
  const { connected } = getDbStatus();
  if (!apiKey || !connected) return;
  const today = new Date().toISOString().slice(0, 10);
  await ApiKey.updateOne({ key: apiKey.key }, [
    {
      $set: {
        last_used_at: new Date(),
        last_request_date: today,
        requests_today: {
          $cond: [
            { $eq: ['$last_request_date', today] },
            { $add: [{ $ifNull: ['$requests_today', 0] }, 1] },
            1,
          ],
        },
      },
    },
  ]);
}

async function rateLimiter(req, res, next) {
  // Fallback for when apiKeyMiddleware didn't set config (shouldn't happen, but be safe)
  if (!req.rateLimitConfig) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    req.rateLimitConfig = {
      quota: getDefaultQuota(),
      identifier: `public:${ip}`,
      tier: 'public',
    };
  }
  const config = req.rateLimitConfig;
  const tierDefaults = getTierDefaults();
  const quota = config.quota || tierDefaults[config.tier] || getDefaultQuota();
  const bucket = getBucket(config.identifier);

  if (bucket.count >= quota) {
    // Calculate retry after (seconds until window expires)
    const retryAfter = Math.ceil((bucket.expiresAt - Date.now()) / 1000);
    return next(new RateLimitExceededError('Rate limit exceeded', quota, WINDOW_MS, retryAfter));
  }

  bucket.count += 1;
  buckets.set(config.identifier, bucket);

  await updateApiKeyUsage(req.apiKey);

  return next();
}

function clearBuckets() {
  buckets.clear();
}

module.exports = rateLimiter;
module.exports.clearBuckets = clearBuckets;
