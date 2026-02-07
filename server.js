require('dotenv').config();

const app = require('./src/app');
const { connectMongo, getDbStatus } = require('./src/db/connection');
const mongoose = require('mongoose');
const { getStaticSource, getStaticScreams } = require('./src/utils/staticScreams');
const { info: logInfo, warn: logWarn, error: logError } = require('./src/utils/logger');
const errorTracking = require('./src/services/errorTracking');

let server = null;
let isShuttingDown = false;

// Export function to check shutdown status (for readiness endpoint)
function getShutdownStatus() {
  return isShuttingDown;
}

module.exports = { getShutdownStatus };

async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    logWarn('Shutdown already in progress, forcing exit', { signal });
    process.exit(1);
  }

  isShuttingDown = true;
  logInfo('Received shutdown signal', { signal });

  // Stop accepting new connections
  if (server) {
    logInfo('Closing HTTP server...');
    return new Promise(() => {
      server.close(async () => {
        logInfo('HTTP server closed');

        // Wait for existing requests to complete (with timeout)
        const shutdownTimeout = setTimeout(() => {
          logWarn('Shutdown timeout reached, forcing exit');
          process.exit(1);
        }, 30000); // 30 second timeout

        try {
          // Flush Sentry events before shutdown
          logInfo('Flushing error tracking events...');
          await errorTracking.flush(2000);

          // Close MongoDB connection if connected
          const dbStatus = getDbStatus();
          if (dbStatus.connected) {
            logInfo('Closing MongoDB connection...');
            await mongoose.connection.close();
            logInfo('MongoDB connection closed');
          }

          clearTimeout(shutdownTimeout);
          logInfo('Graceful shutdown complete');
          process.exit(0);
        } catch (err) {
          clearTimeout(shutdownTimeout);
          logError('Error during shutdown', { error: err.message });
          process.exit(1);
        }
      });
    });
  } else {
    // No server instance, just close DB
    const dbStatus = getDbStatus();
    if (dbStatus.connected) {
      try {
        logInfo('Closing MongoDB connection...');
        await mongoose.connection.close();
        logInfo('MongoDB connection closed');
      } catch (err) {
        logError('Error closing MongoDB', { error: err.message });
      }
    }
    process.exit(0);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', err => {
  logError('Uncaught exception', { error: err.message, stack: err.stack });
  // Track with Sentry (critical error)
  errorTracking.trackError(err, { type: 'uncaughtException' }, false);
  gracefulShutdown('uncaughtException').then(() => process.exit(1));
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, _promise) => {
  logError('Unhandled rejection', { reason: String(reason) });
  // Track with Sentry (critical error)
  const err = reason instanceof Error ? reason : new Error(String(reason));
  errorTracking.trackError(err, { type: 'unhandledRejection' }, false);
  gracefulShutdown('unhandledRejection').then(() => process.exit(1));
});

(async () => {
  const requireMongo = process.env.FULL_STACK === 'true' && !!process.env.MONGODB_URI;

  if (requireMongo) {
    const status = await connectMongo();
    if (!status.connected) {
      logError(`Failed to connect to MongoDB: ${status.error}`);
      process.exit(1);
    }
    logInfo(`Connected to MongoDB at ${status.uri}`);
  } else {
    logInfo(`Serving static dataset from ${getStaticSource()}`);
    // Sanity check for placeholder URLs
    try {
      const screams = getStaticScreams();
      const placeholderCount = screams.reduce((acc, s) => {
        const formats = s.media?.audio || {};
        const urls = Object.values(formats).flatMap(q => Object.values(q || {}));
        return acc + urls.filter(u => typeof u === 'string' && u.includes('example.com')).length;
      }, 0);
      if (placeholderCount > 0) {
        logWarn(
          `Dataset contains ${placeholderCount} placeholder URLs (example.com). ` +
            'Run "pnpm run export:fun" with MONGODB_URI set to refresh with real Cloudinary links.'
        );
      }
    } catch (err) {
      logWarn(`Dataset sanity check failed: ${err.message}`);
    }
  }

  const PORT = process.env.PORT || 3000;
  server = app.listen(PORT, () => {
    logInfo(`Goat Screams API running on port ${PORT}`);
  });
})();
