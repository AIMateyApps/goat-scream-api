# Observability: Logging, Metrics, Request Tracing

You can't fix what you can't see. Observability means understanding what's happening inside your API through logs (what happened), metrics (how much), and traces (the journey of each request).

## Mental Model

The three pillars of observability:

```
┌─────────────────────────────────────────────────────────────┐
│                     Observability                           │
│                                                             │
│  LOGS                 METRICS              TRACES           │
│  "What happened"      "How much"           "The journey"    │
│                                                             │
│  Structured JSON      Counters/Gauges      Request IDs      │
│  Error details        Histograms           Parent/child     │
│  Request context      Percentiles          Timing spans     │
│                                                             │
│  → Debug issues       → Alert on anomalies → Find bottlenecks│
└─────────────────────────────────────────────────────────────┘
```

**Structured logs** include machine-parseable fields (JSON), not just text.
**Prometheus metrics** enable alerting and dashboards.
**Request IDs** correlate logs across services.

## Copy This Pattern

```javascript
// utils/logger.js - Structured logging
const SERVICE_NAME = process.env.SERVICE_NAME || 'my-api';
const SERVICE_VERSION = require('../package.json').version;

function log(level, message, context = {}) {
  const entry = {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    level,
    message: typeof message === 'string' ? message : JSON.stringify(message),
    ...context,
    timestamp: new Date().toISOString(),
  };

  // In production, log as JSON
  if (process.env.NODE_ENV === 'production') {
    const jsonLine = JSON.stringify(entry);
    if (level === 'error') {
      console.error(jsonLine);
    } else {
      console.info(jsonLine);
    }
  } else {
    // In development, human-readable
    const prefix = `[${level.toUpperCase()}]`;
    console.log(prefix, message, context);
  }
}

const logger = {
  info: (message, context) => log('info', message, context),
  warn: (message, context) => log('warn', message, context),
  error: (message, context) => log('error', message, context),
  debug: (message, context) => {
    if (process.env.DEBUG === 'true') {
      log('debug', message, context);
    }
  },
};

// Request-scoped logger with automatic request_id
function createRequestLogger(req) {
  const requestContext = {
    request_id: req.requestId || 'unknown',
  };

  return {
    info: (message, context = {}) => log('info', message, { ...requestContext, ...context }),
    warn: (message, context = {}) => log('warn', message, { ...requestContext, ...context }),
    error: (message, context = {}) => log('error', message, { ...requestContext, ...context }),
  };
}

module.exports = { ...logger, createRequestLogger };
```

```javascript
// services/metrics.js - Prometheus metrics
const promClient = require('prom-client');

const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Request counter
const httpRequestCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

// Request duration histogram
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// Active connections gauge
const activeConnections = new promClient.Gauge({
  name: 'http_active_connections',
  help: 'Active HTTP connections',
  registers: [register],
});

function metricsMiddleware(req, res, next) {
  const start = Date.now();
  activeConnections.inc();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const path = normalizePath(req.originalUrl);

    httpRequestCounter.inc({ method: req.method, path, status: res.statusCode });
    httpRequestDuration.observe({ method: req.method, path, status: res.statusCode }, duration);
    activeConnections.dec();
  });

  next();
}

// Avoid high cardinality - normalize paths
function normalizePath(path) {
  return path
    .replace(/\/[a-f0-9-]{36}/g, '/:id') // UUIDs
    .replace(/\/\d+/g, '/:id') // Numeric IDs
    .split('?')[0]; // Remove query strings
}

async function getMetrics() {
  return register.metrics();
}

module.exports = { metricsMiddleware, getMetrics, register };
```

```javascript
// Request ID middleware
const { randomUUID } = require('crypto');

app.use((req, res, next) => {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info({
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: durationMs.toFixed(2),
    });
  });

  next();
});
```

## In This Repo

**Structured logger:** `src/utils/logger.js:1-109`

Key features:

```javascript
function log(level, message, context = {}) {
  const entry = {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    level,
    message,
    ...context,
    timestamp: new Date().toISOString(),
  };

  if (process.env.NODE_ENV === 'production') {
    console.info(JSON.stringify(entry)); // Machine-parseable
  } else {
    console.log(`[${level.toUpperCase()}]`, message, context); // Human-readable
  }
}
```

**Request-scoped logger:** `src/utils/logger.js:85-100`

```javascript
function createRequestLogger(req) {
  const requestContext = {
    request_id: req.requestId || 'unknown',
  };

  return {
    info: (message, context = {}) => log('info', message, { ...requestContext, ...context }),
    // ... other levels
  };
}
```

**Prometheus metrics:** `src/services/metrics.js:1-247`

Metric types:

```javascript
// Counter - only goes up
const httpRequestCounter = new promClient.Counter({
  name: 'http_requests_total',
  labelNames: ['method', 'path', 'status'],
});

// Histogram - distribution of values
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

// Gauge - can go up or down
const activeConnections = new promClient.Gauge({
  name: 'http_active_connections',
});
```

**Metrics middleware:** `src/services/metrics.js:189-215`

```javascript
function metricsMiddleware(req, res, next) {
  const start = Date.now();
  incrementActiveConnections();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    incrementRequestCounter(method, path, status);
    recordRequestDuration(method, path, status, duration);
    decrementActiveConnections();
  });

  next();
}
```

**Path normalization:** `src/services/metrics.js:174-184`

```javascript
function normalizePath(path) {
  return path
    .replace(/\/api\/screams\/[^/]+/g, '/api/screams/:id')
    .replace(/\/api\/submissions\/[^/]+/g, '/api/submissions/:id')
    .split('?')[0]; // Remove query strings
}
```

**Request ID middleware:** `src/app.js:75-95`

```javascript
app.use((req, res, next) => {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  // ... logging on finish
});
```

**Metrics endpoint:** `src/app.js:233-244`

```javascript
app.get('/metrics', async (req, res) => {
  const metrics = await getMetrics();
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(metrics);
});
```

**Search pattern:** `grep -rn "request_id\|logInfo\|logError" src/`

## Try It

Add a custom metric for downloads by format:

1. **Add the counter** to `src/services/metrics.js`:

   ```javascript
   // Download counter by format
   const downloadCounter = new promClient.Counter({
     name: 'downloads_total',
     help: 'Total downloads by format',
     labelNames: ['format', 'quality'],
     registers: [register],
   });

   function recordDownload(format, quality) {
     downloadCounter.inc({ format, quality });
   }

   module.exports = {
     // ... existing exports
     recordDownload,
   };
   ```

2. **Use it in the service** (`src/services/screamsService.js`):

   ```javascript
   const { recordDownload } = require('./metrics');

   async getDownloadUrl(id, format = 'mp3', quality = 'medium') {
     // ... existing code ...

     // Record the download
     recordDownload(format, quality);

     return {
       download_url: url,
       format,
       quality,
       filename: `goat_scream_${scream.id}.${format}`,
     };
   }
   ```

3. **Test the metric:**

   ```bash
   # Make some downloads
   curl -X POST "http://localhost:3000/api/v1/screams/1/download" \
     -H "Content-Type: application/json" \
     -d '{"format": "mp3", "quality": "high"}'

   # Check metrics endpoint
   curl -s "http://localhost:3000/metrics" | grep downloads_total
   ```

   Expected:

   ```
   downloads_total{format="mp3",quality="high"} 1
   ```

## Debugging Checklist

| Symptom                           | Check                                                  |
| --------------------------------- | ------------------------------------------------------ |
| Logs not structured in production | `NODE_ENV=production` set?                             |
| Missing request_id in logs        | Request ID middleware before routes?                   |
| High cardinality in metrics       | Path normalization working? Check for dynamic IDs      |
| Metrics endpoint returns empty    | Middleware mounted? Check `app.use(metricsMiddleware)` |
| Duration always 0                 | Using `res.on('finish')`, not immediate measurement?   |
| Logs missing in container         | Using `console.log/error`? Check container log driver  |

## FAQ

**Q: Why structured logs over plain text?**

A: Structured logs (JSON) are queryable. You can find all errors for request ID `abc-123` across services. Plain text requires regex parsing and breaks when message format changes.

**Q: Why normalize paths for metrics?**

A: High cardinality kills Prometheus. `/api/screams/abc` and `/api/screams/xyz` should both be `/api/screams/:id`. Otherwise you create millions of unique label combinations.

**Q: Counter vs Gauge vs Histogram?**

A: **Counter** only increases (requests, errors). **Gauge** goes up/down (active connections, queue size). **Histogram** tracks distributions (request latency, response size).

**Q: What percentiles should I track?**

A: P50 (median), P95, P99. P50 tells you typical experience. P99 tells you worst case. Don't track P100 (max)—one outlier skews everything.

**Q: Should I log request bodies?**

A: Generally no—they may contain PII or credentials. Log IDs, query parameters (sanitized), and response status instead. If you must log bodies, redact sensitive fields.

## Further Reading

- Prometheus: [Best Practices](https://prometheus.io/docs/practices/naming/)
- OpenTelemetry: [Observability Primer](https://opentelemetry.io/docs/concepts/observability-primer/)
- Google SRE Book: [Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)

## Next Guide

[09-error-tracking.md](./09-error-tracking.md) - Integrate Sentry for error tracking with proper data scrubbing.
