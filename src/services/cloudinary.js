const cloudinary = require('cloudinary').v2;
const { createCircuitBreaker } = require('./circuitBreaker');

let configured = false;

// Create circuit breakers for Cloudinary operations
let uploadBreaker = null;
let getAssetBreaker = null;
let renameAssetBreaker = null;
let deleteAssetBreaker = null;
let updateMetadataBreaker = null;

function initializeCircuitBreakers() {
  if (uploadBreaker) return; // Already initialized

  const breakerOptions = {
    name: 'cloudinary',
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  };

  // Create breakers for each operation
  uploadBreaker = createCircuitBreaker(async (filePath, options) => {
    configure();
    const opts = {
      resource_type: 'video',
      public_id: options.publicId,
      overwrite: false,
      use_filename: false,
      unique_filename: false,
      folder: undefined,
      tags: options.tags || [],
      context: options.context || {},
    };
    const cleanedContext = sanitizeContext(opts.context);
    if (cleanedContext) {
      opts.context = cleanedContext;
    } else {
      delete opts.context;
    }
    return cloudinary.uploader.upload(filePath, opts);
  }, breakerOptions);

  getAssetBreaker = createCircuitBreaker(async publicId => {
    configure();
    try {
      return await cloudinary.api.resource(publicId, { resource_type: 'video' });
    } catch (err) {
      if (err.http_code === 404) return null;
      throw err;
    }
  }, breakerOptions);

  renameAssetBreaker = createCircuitBreaker(async (fromPublicId, toPublicId, options) => {
    configure();
    return cloudinary.uploader.rename(fromPublicId, toPublicId, {
      resource_type: 'video',
      overwrite: true,
      ...options,
    });
  }, breakerOptions);

  deleteAssetBreaker = createCircuitBreaker(async publicId => {
    configure();
    return cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
  }, breakerOptions);

  updateMetadataBreaker = createCircuitBreaker(async (publicId, { context = {}, tags = [] }) => {
    configure();
    const payload = { resource_type: 'video' };
    const sanitizedContext = sanitizeContext(context);
    if (sanitizedContext) {
      payload.context = sanitizedContext;
    }
    if (Array.isArray(tags) && tags.length) {
      payload.tags = Array.from(new Set(tags));
    }
    return cloudinary.api.update(publicId, payload);
  }, breakerOptions);
}

function configure() {
  if (configured) return;

  const { CLOUDINARY_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env;

  if (
    !CLOUDINARY_URL &&
    (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET)
  ) {
    throw new Error('Cloudinary environment variables not set');
  }

  cloudinary.config({
    secure: true,
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });

  configured = true;
}

function sanitizeContext(context) {
  if (!context || Object.keys(context).length === 0) return null;

  const sanitize = val => {
    const str = String(val == null ? '' : val)
      .normalize('NFKD')
      .replace(/[\n\r\t]+/g, ' ')
      .replace(/[^\x20-\x7E]/g, '');
    return str.slice(0, 1000);
  };

  const cleanContext = {};
  Object.entries(context).forEach(([rawKey, rawValue]) => {
    if (rawValue == null || rawValue === '') return;
    const key = sanitize(rawKey).trim();
    const value = sanitize(rawValue).trim();
    if (key && value) cleanContext[key] = value;
  });

  return Object.keys(cleanContext).length ? cleanContext : null;
}

async function uploadAudio(filePath, { publicId, tags = [], context = {} }) {
  initializeCircuitBreakers();
  return uploadBreaker.fire(filePath, { publicId, tags, context });
}

async function getAsset(publicId) {
  initializeCircuitBreakers();
  return getAssetBreaker.fire(publicId);
}

async function renameAsset(fromPublicId, toPublicId, options = {}) {
  initializeCircuitBreakers();
  return renameAssetBreaker.fire(fromPublicId, toPublicId, options);
}

async function deleteAsset(publicId) {
  initializeCircuitBreakers();
  return deleteAssetBreaker.fire(publicId);
}

async function updateAssetMetadata(publicId, { context = {}, tags = [] } = {}) {
  initializeCircuitBreakers();
  return updateMetadataBreaker.fire(publicId, { context, tags });
}

/**
 * Get circuit breaker state for Cloudinary
 */
function getCircuitBreakerState() {
  const { getCircuitState } = require('./circuitBreaker');
  return getCircuitState('cloudinary');
}

module.exports = {
  uploadAudio,
  getAsset,
  renameAsset,
  deleteAsset,
  updateAssetMetadata,
  getCircuitBreakerState,
};
