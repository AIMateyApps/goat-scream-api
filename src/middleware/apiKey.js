const ApiKey = require('../models/ApiKey');
const { DatabaseError, AuthenticationError } = require('../errors');

function getDefaultQuota() {
  return Number(process.env.RATE_LIMIT_MAX || 100);
}

async function apiKeyMiddleware(req, res, next) {
  const headerKey = req.headers['x-api-key'];
  if (!headerKey) {
    // Use IP or fallback to a consistent identifier for requests without IP
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    req.rateLimitConfig = {
      quota: getDefaultQuota(),
      identifier: `public:${ip}`,
      tier: 'public',
    };
    return next();
  }

  try {
    const doc = await ApiKey.findOne({
      key: headerKey,
      status: 'active',
    }).lean();
    if (!doc) {
      return next(new AuthenticationError('Invalid or inactive API key', 'api_key'));
    }
    req.apiKey = doc;
    req.rateLimitConfig = {
      quota: doc.quota_per_minute || getDefaultQuota(),
      identifier: `key:${doc.key}`,
      tier: doc.tier,
    };
    return next();
  } catch {
    return next(new DatabaseError('API key lookup failed', 'api_key_lookup'));
  }
}

module.exports = apiKeyMiddleware;
