# Rate Limiting: Token Bucket + API Key Tiers

Uncontrolled traffic can overwhelm your API. Rate limiting protects your infrastructure while providing tiered access for different user types—free users get basic quotas, paying customers get more.

## Mental Model

The token bucket algorithm is like a bucket that fills with tokens over time:

```
┌─────────────────────────────────────┐
│         Token Bucket                │
│                                     │
│    Capacity: 100 tokens             │
│    Refill: 100 tokens per minute    │
│                                     │
│    ████████████████████ (80 tokens) │
│                                     │
│    Request arrives:                 │
│    - Token available? → Allow       │
│    - No tokens? → 429 Too Many      │
└─────────────────────────────────────┘
```

Combined with API keys, you get tiered quotas:

```
No API Key:    100 req/min (by IP)
Basic Key:     200 req/min
Pro Key:       600 req/min
```

## Copy This Pattern

```javascript
// middleware/apiKey.js - Identify the requester
const ApiKey = require('../models/ApiKey');
const { AuthenticationError } = require('../errors');

async function apiKeyMiddleware(req, res, next) {
  const headerKey = req.headers['x-api-key'];

  if (!headerKey) {
    // No key - use IP-based rate limiting
    const ip = req.ip || 'unknown';
    req.rateLimitConfig = {
      quota: 100,
      identifier: `public:${ip}`,
      tier: 'public',
    };
    return next();
  }

  // Validate key
  const doc = await ApiKey.findOne({ key: headerKey, status: 'active' }).lean();
  if (!doc) {
    return next(new AuthenticationError('Invalid or inactive API key'));
  }

  req.apiKey = doc;
  req.rateLimitConfig = {
    quota: doc.quota_per_minute || 200,
    identifier: `key:${doc.key}`,
    tier: doc.tier,
  };
  return next();
}

module.exports = apiKeyMiddleware;
```

```javascript
// middleware/rateLimiter.js - Enforce the limits
const { RateLimitExceededError } = require('../errors');

const WINDOW_MS = 60_000; // 1 minute
const buckets = new Map();

function getBucket(identifier) {
  const now = Date.now();
  let bucket = buckets.get(identifier);

  if (!bucket || bucket.expiresAt <= now) {
    // New window
    bucket = { count: 0, expiresAt: now + WINDOW_MS };
    buckets.set(identifier, bucket);
  }

  return bucket;
}

async function rateLimiter(req, res, next) {
  const config = req.rateLimitConfig;
  if (!config) {
    // Fallback if apiKeyMiddleware didn't run
    const ip = req.ip || 'unknown';
    req.rateLimitConfig = {
      quota: 100,
      identifier: `public:${ip}`,
      tier: 'public',
    };
  }

  const { quota, identifier } = req.rateLimitConfig;
  const bucket = getBucket(identifier);

  if (bucket.count >= quota) {
    const retryAfter = Math.ceil((bucket.expiresAt - Date.now()) / 1000);
    return next(new RateLimitExceededError('Rate limit exceeded', quota, WINDOW_MS, retryAfter));
  }

  bucket.count += 1;

  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', quota);
  res.setHeader('X-RateLimit-Remaining', quota - bucket.count);
  res.setHeader('X-RateLimit-Reset', Math.ceil(bucket.expiresAt / 1000));

  return next();
}

module.exports = rateLimiter;
```

```javascript
// errors/RateLimitExceededError.js
const AppError = require('./AppError');

class RateLimitExceededError extends AppError {
  constructor(message, quota, windowMs, retryAfter) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', true);
    this.quota = quota;
    this.windowMs = windowMs;
    this.retryAfter = retryAfter;
  }

  toJSON() {
    const obj = super.toJSON();
    obj.error.quota = this.quota;
    obj.error.window_ms = this.windowMs;
    obj.error.retry_after = this.retryAfter;
    return obj;
  }
}

module.exports = RateLimitExceededError;
```

## In This Repo

**API key middleware:** `src/middleware/apiKey.js:8-39`

Sets rate limit config based on key presence:

```javascript
async function apiKeyMiddleware(req, res, next) {
  const headerKey = req.headers['x-api-key'];
  if (!headerKey) {
    const ip = req.ip || 'unknown';
    req.rateLimitConfig = {
      quota: getDefaultQuota(),
      identifier: `public:${ip}`,
      tier: 'public',
    };
    return next();
  }

  const doc = await ApiKey.findOne({ key: headerKey, status: 'active' }).lean();
  // ... validate and set req.rateLimitConfig
}
```

**Rate limiter:** `src/middleware/rateLimiter.js:20-80`

Token bucket implementation:

```javascript
function getBucket(identifier) {
  const now = Date.now();
  let bucket = buckets.get(identifier);
  if (!bucket || bucket.expiresAt <= now) {
    bucket = { count: 0, expiresAt: now + WINDOW_MS };
    buckets.set(identifier, bucket);
  }
  return bucket;
}
```

**Tier defaults:** `src/middleware/rateLimiter.js:11-18`

```javascript
function getTierDefaults() {
  return {
    public: 100,
    basic: 200,
    pro: 600,
  };
}
```

**Rate limit error:** `src/errors/RateLimitExceededError.js:8-22`

```javascript
class RateLimitExceededError extends RateLimitError {
  constructor(message, quota, windowMs, retryAfter) {
    super(message, quota, windowMs);
    this.code = 'RATE_LIMIT_EXCEEDED';
    this.retryAfter = retryAfter;
  }
}
```

**Middleware chain:** `src/app.js:248`

```javascript
v1Router.use(apiKeyMiddleware, rateLimiter, cacheMiddleware());
```

**Search pattern:** `grep -rn "rateLimitConfig\|x-api-key" src/`

## Try It

Add a "premium" tier with 1000 requests/minute:

1. **Update tier defaults** in `src/middleware/rateLimiter.js`:

   ```javascript
   function getTierDefaults() {
     const defaultQuota = getDefaultQuota();
     return {
       public: defaultQuota,
       basic: 200,
       pro: 600,
       premium: 1000, // Add this line
     };
   }
   ```

2. **Test rate limiting:**

   ```bash
   # Make requests until limited (default: 100/min)
   for i in {1..110}; do
     STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/v1/screams?limit=1")
     echo "Request $i: $STATUS"
     if [ "$STATUS" = "429" ]; then
       echo "Rate limited after $i requests"
       break
     fi
   done
   ```

3. **Check rate limit headers:**

   ```bash
   curl -si "http://localhost:3000/api/v1/screams?limit=1" | grep -i x-ratelimit
   ```

   Expected:

   ```
   X-RateLimit-Limit: 100
   X-RateLimit-Remaining: 99
   X-RateLimit-Reset: 1704067260
   ```

4. **Test 429 response:**
   ```bash
   curl -s "http://localhost:3000/api/v1/screams" \
     -H "X-Api-Key: invalid-key" | jq
   ```

## Debugging Checklist

| Symptom                        | Check                                                      |
| ------------------------------ | ---------------------------------------------------------- |
| Rate limit not enforced        | Middleware in correct order? (apiKey → rateLimiter)        |
| All requests share same bucket | Identifier unique? Check `req.rateLimitConfig.identifier`  |
| Limit resets too quickly       | `WINDOW_MS` set correctly? Default is 60000ms              |
| No rate limit headers          | Headers set after `bucket.count += 1`?                     |
| 401 instead of 429             | Invalid key returns auth error, not rate limit error       |
| Memory growing                 | Old buckets never cleared? Add cleanup for expired buckets |

## FAQ

**Q: Why token bucket over sliding window?**

A: Token bucket is simpler and allows burst traffic at window start. Sliding window is more even but requires more storage. For most APIs, token bucket provides good balance.

**Q: Where should I store buckets in production?**

A: For single-instance, in-memory Map works. For multiple instances, use Redis with `INCR` and `EXPIRE` commands. This ensures all instances share the same view of request counts.

**Q: Should I rate limit by IP or API key?**

A: Both. IP for anonymous users, API key for authenticated. This prevents one bad actor from affecting others while giving authenticated users predictable quotas.

**Q: What's a reasonable limit?**

A: Start conservative (100/min for free) and increase based on actual usage patterns. Monitor median usage and set limits that affect only the top 1-5% of users.

**Q: Should I return `Retry-After` header?**

A: Yes! `Retry-After: 30` tells well-behaved clients exactly when to retry. Better than clients guessing or hammering immediately.

## Further Reading

- IETF: [Rate Limiting Headers](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers)
- AWS: [API Gateway Throttling](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html)
- Stripe: [Rate Limiting](https://stripe.com/docs/rate-limits)

## Next Guide

[07-circuit-breakers.md](./07-circuit-breakers.md) - Protect your API from cascading failures when external services go down.
