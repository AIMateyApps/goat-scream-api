# HTTP Cache Headers: ETags + Cache-Control

Server-side caching reduces database load. Client-side caching reduces network traffic. HTTP cache headers let browsers and CDNs store responses, serving them without hitting your server at all.

## Mental Model

HTTP caching works through headers and conditional requests:

```
First request:
Client → Server: GET /api/screams
Server → Client: 200 OK
                 Cache-Control: public, max-age=300
                 ETag: W/"abc123"
                 [response body]

Client caches response for 5 minutes (300s)

Within 5 minutes:
Client → (serves from cache, no network request)

After 5 minutes:
Client → Server: GET /api/screams
                 If-None-Match: W/"abc123"
Server → Client: 304 Not Modified (if unchanged)
                 OR
                 200 OK + new body (if changed)
```

**Cache-Control** tells clients how long to cache.
**ETag** identifies the exact response version.
**304 Not Modified** saves bandwidth when content hasn't changed.

## Copy This Pattern

```javascript
// middleware/cache.js
const { createHash } = require('crypto');

// Route-specific cache configuration
const DEFAULT_CONFIG = {
  '/api/v1/items': { directive: 'public', maxAge: 300, staleWhileRevalidate: 60 },
  '/api/v1/items/random': { directive: 'no-store' }, // Never cache random
  '/health': { directive: 'no-store' },
};

function generateETag(body) {
  const hash = createHash('md5').update(body).digest('hex').slice(0, 16);
  return `W/"${hash}"`; // Weak ETag (semantic equivalence)
}

function etagMatches(ifNoneMatch, etag) {
  if (!ifNoneMatch || !etag) return false;
  const tags = ifNoneMatch.split(',').map(t => t.trim());
  return tags.includes('*') || tags.includes(etag);
}

function buildCacheControl(config) {
  if (config.directive === 'no-store') {
    return 'no-store, no-cache, must-revalidate';
  }

  const parts = [config.directive];
  if (config.maxAge !== undefined) {
    parts.push(`max-age=${config.maxAge}`);
  }
  if (config.staleWhileRevalidate !== undefined) {
    parts.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
  }
  return parts.join(', ');
}

function findCacheConfig(path, config) {
  // Exact match first
  if (config[path]) return config[path];

  // Prefix match (longest wins)
  const matches = Object.keys(config)
    .filter(pattern => path.startsWith(pattern))
    .sort((a, b) => b.length - a.length);

  return matches.length > 0 ? config[matches[0]] : null;
}

function cacheMiddleware(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options.routes };
  const enableETag = options.etag !== false;

  return function cache(req, res, next) {
    // Only cache GET/HEAD
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    const cacheConfig = findCacheConfig(req.path, config);
    if (!cacheConfig) return next();

    // Set Cache-Control
    res.setHeader('Cache-Control', buildCacheControl(cacheConfig));

    // Skip ETag for no-store
    if (cacheConfig.directive === 'no-store' || !enableETag) {
      return next();
    }

    // Intercept res.json to add ETag
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      const bodyString = JSON.stringify(body);
      const etag = generateETag(bodyString);

      res.setHeader('ETag', etag);

      // Check for conditional request
      const ifNoneMatch = req.get('If-None-Match');
      if (etagMatches(ifNoneMatch, etag)) {
        res.status(304);
        return res.end(); // No body for 304
      }

      return originalJson(body);
    };

    next();
  };
}

module.exports = cacheMiddleware;
module.exports.generateETag = generateETag;
module.exports.DEFAULT_CONFIG = DEFAULT_CONFIG;
```

## In This Repo

**Cache middleware:** `src/middleware/cache.js:1-182`

Key features:

1. **Route-specific configuration** (lines 16-29):

   ```javascript
   const DEFAULT_CONFIG = {
     '/api/v1/screams/random': { directive: 'no-store' }, // Never cache random
     '/api/v1/screams': { directive: 'public', maxAge: 300, staleWhileRevalidate: 60 },
     '/api/v1/search': { directive: 'public', maxAge: 60, staleWhileRevalidate: 30 },
     '/health': { directive: 'no-store' },
     '/ready': { directive: 'no-store' },
   };
   ```

2. **Weak ETag generation** (lines 38-41):

   ```javascript
   function generateETag(body) {
     const hash = createHash('md5').update(body).digest('hex').slice(0, 16);
     return `W/"${hash}"`; // W/ = weak validator
   }
   ```

3. **Conditional request handling** (lines 162-168):

   ```javascript
   const ifNoneMatch = req.get('If-None-Match');
   if (etagMatches(ifNoneMatch, etag)) {
     res.status(304);
     return res.end();
   }
   ```

4. **Prefix matching** (lines 92-104):

   ```javascript
   function findCacheConfig(path, config) {
     if (config[path]) return config[path]; // Exact match

     // Prefix match - /api/v1/screams matches /api/v1/screams/123
     const matches = Object.keys(config)
       .filter(pattern => path.startsWith(pattern))
       .sort((a, b) => b.length - a.length);

     return matches.length > 0 ? config[matches[0]] : null;
   }
   ```

**Mounting:** `src/app.js:105` and `src/app.js:248`

```javascript
// Global (for health endpoints)
app.use(cacheMiddleware());

// Per-router (for API routes)
v1Router.use(cacheMiddleware());
```

**Search pattern:** `grep -rn "Cache-Control\|ETag" src/`

## Try It

Test conditional requests to measure bandwidth savings:

1. **Make initial request, save the ETag:**

   ```bash
   ETAG=$(curl -si "http://localhost:3000/api/v1/screams?limit=5" | grep -i etag | cut -d' ' -f2 | tr -d '\r')
   echo "ETag: $ETAG"
   ```

2. **Make conditional request with If-None-Match:**

   ```bash
   curl -si "http://localhost:3000/api/v1/screams?limit=5" \
     -H "If-None-Match: $ETAG"
   ```

   Expected: `HTTP/1.1 304 Not Modified` with no body

3. **Verify Cache-Control header:**

   ```bash
   curl -si "http://localhost:3000/api/v1/screams?limit=5" | grep -i cache-control
   ```

   Expected: `Cache-Control: public, max-age=300, stale-while-revalidate=60`

4. **Test no-store for random endpoint:**

   ```bash
   curl -si "http://localhost:3000/api/v1/screams/random" | grep -i cache-control
   ```

   Expected: `Cache-Control: no-store, no-cache, must-revalidate`

5. **Measure bandwidth savings:**

   ```bash
   # Full response
   curl -s "http://localhost:3000/api/v1/screams?limit=100" | wc -c

   # Conditional 304 response
   curl -s "http://localhost:3000/api/v1/screams?limit=100" \
     -H "If-None-Match: $ETAG" | wc -c
   ```

## Debugging Checklist

| Symptom                      | Check                                                   |
| ---------------------------- | ------------------------------------------------------- |
| No Cache-Control header      | Route matches config? Check `findCacheConfig()`         |
| No ETag header               | `enableETag` not false? `no-store` routes skip ETags    |
| 200 instead of 304           | ETag format matches? Include `W/` prefix                |
| Cache not respecting config  | Middleware order? Must run before route handlers        |
| Random endpoint being cached | Specific route config before prefix? Longer paths first |

## FAQ

**Q: Weak vs Strong ETags?**

A: **Weak ETags** (`W/"..."`) indicate semantic equivalence—content might differ in whitespace or encoding but means the same thing. **Strong ETags** indicate byte-for-byte equivalence. Use weak ETags for JSON APIs since whitespace variations don't matter.

**Q: What's `stale-while-revalidate`?**

A: After `max-age` expires, the cache can serve stale content while fetching fresh content in the background. Users see fast responses while the cache updates asynchronously. Example: `max-age=300, stale-while-revalidate=60` means "cache for 5 min, then serve stale for up to 1 more min while refreshing".

**Q: Should I cache authenticated endpoints?**

A: Use `private` instead of `public` for user-specific data. `private` caches only allow the user's browser to cache, not shared CDNs. Or use `no-store` if the data is sensitive.

**Q: Why MD5 for ETags?**

A: Speed. MD5 is fast and produces short hashes. It's not used for security—just identifying content versions. The hash collision risk is negligible for this use case.

**Q: Can CDNs use these headers?**

A: Yes! CDNs respect `Cache-Control` and `ETag`. A CDN can serve 304 responses without hitting your origin server, dramatically reducing load.

## Further Reading

- MDN: [HTTP Caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- MDN: [ETag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag)
- Google: [HTTP Caching](https://web.dev/http-cache/)

## Next Guide

[06-rate-limiting.md](./06-rate-limiting.md) - Implement token bucket rate limiting with API key tiers.
