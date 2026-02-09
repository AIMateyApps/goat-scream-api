const fs = require('fs');
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { randomUUID } = require('crypto');
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const mongoose = require('mongoose');
const { getDbStatus } = require('./db/connection');
// Submission model not used directly in app.js (used in routes)
const packageJson = require('../package.json');
const apiKeyMiddleware = require('./middleware/apiKey');
const rateLimiter = require('./middleware/rateLimiter');
const cacheMiddleware = require('./middleware/cache');
const { writeLog } = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const errorTracking = require('./services/errorTracking');
const keyRoutes = require('./routes/keyRequests');

const app = express();

// Initialize error tracking
errorTracking.initialize();

// Security headers with CSP tuned for Cloudinary-hosted media assets
const defaultCsp = helmet.contentSecurityPolicy.getDefaultDirectives();
const cspDirectives = {
  ...defaultCsp,
  'img-src': ["'self'", 'data:', 'https://res.cloudinary.com'],
  'media-src': ["'self'", 'https://res.cloudinary.com'],
  'connect-src': [
    "'self'",
    'https://res.cloudinary.com',
    'https://api.goatscreams.com',
    'http://localhost:3000',
  ],
};
app.use(
  helmet({
    contentSecurityPolicy: { directives: cspDirectives },
    crossOriginEmbedderPolicy: false,
  })
);
// Allow cross-origin requests for public endpoints
app.use(
  cors({
    origin: '*',
  })
);
app.use(compression());
app.use(express.json());

// Request timeout middleware (before routes)
// Supports per-route configuration: { default: 30000, routes: { '/api/stats': 10000 } }
const timeoutMiddleware = require('./middleware/timeout');
app.use(
  timeoutMiddleware({
    default: parseInt(process.env.REQUEST_TIMEOUT_MS || 30000, 10),
    routes: {
      // Example: shorter timeout for stats endpoint
      // '/api/stats': 10000,
      // Example: longer timeout for submissions (file uploads)
      // '/api/submissions': 60000,
    },
  })
);

// Prometheus metrics middleware (before routes, after timeout)
const { metricsMiddleware } = require('./services/metrics');
app.use(metricsMiddleware);

app.use((req, res, next) => {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const logPayload = {
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Number(durationMs.toFixed(2)),
      ip: req.ip,
      timestamp: new Date().toISOString(),
    };
    // Logging handled by logger utility now
    writeLog(logPayload);
  });
  next();
});
const morganFormat =
  process.env.NODE_ENV === 'production'
    ? 'combined'
    : process.env.NODE_ENV === 'test'
      ? 'tiny'
      : 'dev';
app.use(morgan(morganFormat));

// Cache headers for operational endpoints
app.use(cacheMiddleware());

// Health and readiness endpoints - must be before static middleware
// Liveness endpoint - returns 200 if process is running
app.get('/health', (req, res) => {
  const { getDbStatus } = require('./db/connection');
  const db = getDbStatus();

  res.json({
    status: 'screaming', // Frontend checks for "scream" in status
    db: {
      connected: db.connected || false,
    },
    uptime_seconds: process.uptime(), // Frontend uses this for uptime calculation
  });
});

// Readiness endpoint - checks if service can serve requests
app.get('/ready', async (req, res) => {
  const { getShutdownStatus } = require('../server');
  const checks = {
    shutdown: false,
    db: null,
    data: null,
  };

  // Check shutdown flag
  if (getShutdownStatus && getShutdownStatus()) {
    checks.shutdown = true;
    return res.status(503).json({
      status: 'not ready',
      checks,
      message: 'Service is shutting down',
    });
  }

  // Check MongoDB connection (if required)
  const db = getDbStatus();
  const requireMongo = process.env.FULL_STACK === 'true' && !!process.env.MONGODB_URI;

  if (requireMongo) {
    if (db.connected) {
      try {
        // Simple ping to verify connection is alive
        await mongoose.connection.db.admin().ping();
        checks.db = { status: 'connected', uri: db.uri };
      } catch (err) {
        checks.db = { status: 'disconnected', error: err.message };
        return res.status(503).json({
          status: 'not ready',
          checks,
          message: 'Database connection failed',
        });
      }
    } else {
      checks.db = { status: 'disconnected', error: db.error || 'Not connected' };
      return res.status(503).json({
        status: 'not ready',
        checks,
        message: 'Database not connected',
      });
    }
  } else {
    checks.db = { status: 'not required' };
  }

  // Check static data file readability
  try {
    const { getStaticScreams } = require('./utils/staticScreams');
    const screams = getStaticScreams();
    checks.data = { status: 'ok', count: screams.length };
  } catch (err) {
    checks.data = { status: 'error', error: err.message };
    return res.status(503).json({
      status: 'not ready',
      checks,
      message: 'Static data file not readable',
    });
  }

  // Check circuit breaker states (if Cloudinary is configured)
  let circuitBreakers = null;
  try {
    const { getAllCircuitStates } = require('./services/circuitBreaker');
    circuitBreakers = getAllCircuitStates();
  } catch {
    // Circuit breakers not initialized, ignore
  }

  res.json({
    status: 'ready',
    checks,
    circuit_breakers: circuitBreakers,
    timestamp: new Date().toISOString(),
    version: packageJson.version,
  });
});

// Redirect root to Goat Screams developer landing page
app.get('/', (req, res) => {
  res.redirect(301, 'https://www.goatscreams.com/developer');
});

// Static file serving - after health/ready endpoints (serves docs, 404.html, favicons)
app.use(express.static(path.join(__dirname, '../public')));

// OpenAPI documentation
const openApiPath = path.join(__dirname, '../docs/openapi.yaml');
let openApiDocument = null;
let openApiYaml = null;
try {
  openApiYaml = fs.readFileSync(openApiPath, 'utf8');
  openApiDocument = yaml.load(openApiYaml);
} catch (err) {
  const { warn: logWarn } = require('./utils/logger');
  logWarn('Unable to load OpenAPI document', { error: err.message });
}

if (openApiDocument) {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument, { explorer: true }));

  // Expose machine-readable OpenAPI docs
  app.get('/openapi.json', (req, res) => res.json(openApiDocument));
}

if (openApiYaml) {
  app.get(['/openapi.yaml', '/openapi.yml'], (req, res) => {
    res.type('text/yaml');
    res.send(openApiYaml);
  });
}

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    const { getMetrics } = require('./services/metrics');
    const metrics = await getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (err) {
    const { error: logError } = require('./utils/logger');
    logError('Failed to generate metrics', { error: err.message });
    res.status(500).json({ error: 'Failed to generate metrics' });
  }
});

// API v1 routes (require API key)
const v1Router = express.Router();
v1Router.use(apiKeyMiddleware, rateLimiter, cacheMiddleware());
v1Router.use('/keys', keyRoutes);
v1Router.use('/screams', require('./routes/screams'));
v1Router.use('/search', require('./routes/search'));
v1Router.use('/stats', require('./routes/stats'));
v1Router.use('/submissions', require('./routes/submissions'));
v1Router.use('/moderation', require('./routes/moderation'));

app.use('/api/v1', v1Router);

// Legacy /api/* redirect to /api/v1/* for backwards compatibility
app.use('/api', (req, res) => {
  // Skip if path is exactly /api (could be a version listing request)
  if (req.path === '/' || req.path === '') {
    return res.json({
      versions: ['v1'],
      current: 'v1',
      message: 'Please use /api/v1/* endpoints',
    });
  }
  // Redirect to v1
  const newPath = `/api/v1${req.path}`;
  res.redirect(308, newPath);
});

// 404 handler - must be before error handler
app.use((req, res, next) => {
  const { NotFoundError } = require('./errors');
  const notFound = new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`);
  notFound.requestId = req.requestId || 'unknown';
  next(notFound);
});

// Error handler middleware (must be last)
app.use(errorHandler);

module.exports = app;
