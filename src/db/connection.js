const mongoose = require('mongoose');

const status = {
  connected: false,
  uri: null,
  error: null,
};

function redactMongoUri(uri) {
  if (!uri) return null;
  const protocols = ['mongodb+srv://', 'mongodb://'];
  const protocol = protocols.find(p => uri.startsWith(p)) || '';
  const rest = uri.slice(protocol.length);
  const atIndex = rest.indexOf('@');
  if (atIndex === -1) {
    return `${protocol}${rest}`;
  }
  const hostPlus = rest.slice(atIndex + 1);
  return `${protocol}[redacted]@${hostPlus}`;
}

async function connectMongo({ uri, options = {} } = {}) {
  // If uri is explicitly null/undefined, don't fall back to env
  const mongoUri = uri !== undefined ? uri : process.env.MONGODB_URI;
  if (!mongoUri) {
    status.connected = false;
    status.uri = null;
    status.error = 'MONGODB_URI not set';
    return status;
  }
  status.uri = redactMongoUri(mongoUri);
  try {
    await mongoose.connect(mongoUri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000, // Fail faster for invalid hosts
      connectTimeoutMS: 5000,
      // Connection pool settings for better throughput
      maxPoolSize: parseInt(process.env.MONGO_POOL_SIZE, 10) || 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      waitQueueTimeoutMS: 5000,
      ...options,
    });
    status.connected = true;
    status.error = null;
  } catch (err) {
    status.connected = false;
    status.error = err.message;
  }
  return status;
}

function getDbStatus() {
  return { ...status };
}

module.exports = { connectMongo, getDbStatus };
