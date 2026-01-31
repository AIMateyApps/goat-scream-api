const BaseRepository = require('./baseRepository');
const GoatScream = require('../models/GoatScream');
const { createCircuitBreaker, getCircuitState } = require('../services/circuitBreaker');

// Circuit breaker for MongoDB operations
let mongoBreaker = null;

/**
 * Initialize MongoDB circuit breaker
 */
function initializeCircuitBreaker() {
  if (mongoBreaker) return mongoBreaker;

  mongoBreaker = createCircuitBreaker(async operation => operation(), {
    name: 'mongodb',
    timeout: parseInt(process.env.MONGO_CIRCUIT_TIMEOUT || '10000', 10),
    errorThresholdPercentage: parseInt(process.env.MONGO_CIRCUIT_ERROR_THRESHOLD || '50', 10),
    resetTimeout: parseInt(process.env.MONGO_CIRCUIT_RESET_TIMEOUT || '30000', 10),
  });

  return mongoBreaker;
}

/**
 * Execute a MongoDB operation through the circuit breaker
 * @param {Function} operation - Async function to execute
 * @returns {Promise<*>} Operation result
 */
async function withCircuitBreaker(operation) {
  const breaker = initializeCircuitBreaker();
  return breaker.fire(operation);
}

/**
 * Get circuit breaker state for MongoDB
 * @returns {Object} Circuit breaker state
 */
function getMongoCircuitState() {
  return getCircuitState('mongodb');
}

/**
 * MongoDB implementation of screams repository
 */
class MongoScreamsRepository extends BaseRepository {
  /**
   * Find documents matching filter
   * @param {Object} filter - MongoDB query filter
   * @param {Object} options - Query options
   * @param {Object} options.sort - Sort specification
   * @param {number} options.skip - Number of documents to skip
   * @param {number} options.limit - Maximum number of documents to return
   * @param {Object} options.projection - Field projection
   * @returns {Promise<Array>} Array of documents
   */
  async find(filter, options = {}) {
    return withCircuitBreaker(async () => {
      const { sort, skip, limit, projection } = options;
      let query = GoatScream.find(filter, projection || { _id: 0, __v: 0 }).lean();

      if (sort) {
        query = query.sort(sort);
      }
      if (skip !== undefined) {
        query = query.skip(skip);
      }
      if (limit !== undefined) {
        query = query.limit(limit);
      }

      return query.exec();
    });
  }

  /**
   * Find a single document by ID
   * @param {string} id - Document ID
   * @returns {Promise<Object|null>} Document or null if not found
   */
  async findById(id) {
    return withCircuitBreaker(async () => {
      return GoatScream.findOne({ id, approved: true }, { _id: 0, __v: 0 }).lean().exec();
    });
  }

  /**
   * Find random documents matching filter
   * @param {Object} filter - MongoDB query filter
   * @param {number} limit - Number of random documents to return
   * @returns {Promise<Array>} Array of random documents
   */
  async findRandom(filter, limit) {
    return withCircuitBreaker(async () => {
      return GoatScream.aggregate([{ $match: filter }, { $sample: { size: limit } }]).exec();
    });
  }

  /**
   * Count documents matching filter
   * @param {Object} filter - MongoDB query filter
   * @returns {Promise<number>} Count of matching documents
   */
  async count(filter) {
    return withCircuitBreaker(async () => {
      return GoatScream.countDocuments(filter).exec();
    });
  }

  /**
   * Run aggregation pipeline
   * @param {Array} pipeline - MongoDB aggregation pipeline
   * @returns {Promise<Array>} Aggregation results
   */
  async aggregate(pipeline) {
    return withCircuitBreaker(async () => {
      return GoatScream.aggregate(pipeline).exec();
    });
  }

  /**
   * Get distinct values for a field
   * @param {string} field - Field path (e.g., 'goat.breed')
   * @param {Object} filter - Query filter
   * @returns {Promise<Array>} Array of distinct values
   */
  async distinct(field, filter) {
    return withCircuitBreaker(async () => {
      return GoatScream.distinct(field, filter).exec();
    });
  }

  /**
   * Update a document
   * @param {Object} filter - Query filter
   * @param {Object} update - Update operations
   * @returns {Promise<Object>} Update result
   */
  async updateOne(filter, update) {
    return withCircuitBreaker(async () => {
      return GoatScream.updateOne(filter, update).exec();
    });
  }

  /**
   * Get circuit breaker state for MongoDB operations
   * @returns {Object} Circuit breaker state
   */
  static getCircuitBreakerState() {
    return getMongoCircuitState();
  }
}

module.exports = MongoScreamsRepository;
