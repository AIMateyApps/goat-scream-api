/**
 * Base repository interface/abstract class
 * Defines the contract that all repository implementations must follow
 */
class BaseRepository {
  /**
   * Find documents matching filter
   * @param {Object} filter - Query filter
   * @param {Object} options - Query options (sort, skip, limit, projection)
   * @returns {Promise<Array>} Array of documents
   */
  async find(_filter, _options = {}) {
    throw new Error('find() must be implemented by repository subclass');
  }

  /**
   * Find a single document by ID
   * @param {string} id - Document ID
   * @returns {Promise<Object|null>} Document or null if not found
   */
  async findById(_id) {
    throw new Error('findById() must be implemented by repository subclass');
  }

  /**
   * Find random documents matching filter
   * @param {Object} filter - Query filter
   * @param {number} limit - Number of random documents to return
   * @returns {Promise<Array>} Array of random documents
   */
  async findRandom(_filter, _limit) {
    throw new Error('findRandom() must be implemented by repository subclass');
  }

  /**
   * Count documents matching filter
   * @param {Object} filter - Query filter
   * @returns {Promise<number>} Count of matching documents
   */
  async count(_filter) {
    throw new Error('count() must be implemented by repository subclass');
  }

  /**
   * Run aggregation pipeline
   * @param {Array} pipeline - MongoDB aggregation pipeline
   * @returns {Promise<Array>} Aggregation results
   */
  async aggregate(_pipeline) {
    throw new Error('aggregate() must be implemented by repository subclass');
  }

  /**
   * Get distinct values for a field
   * @param {string} field - Field path
   * @param {Object} filter - Query filter
   * @returns {Promise<Array>} Array of distinct values
   */
  async distinct(_field, _filter) {
    throw new Error('distinct() must be implemented by repository subclass');
  }

  /**
   * Update a document
   * @param {Object} filter - Query filter
   * @param {Object} update - Update operations
   * @returns {Promise<Object>} Update result
   */
  async updateOne(_filter, _update) {
    throw new Error('updateOne() must be implemented by repository subclass');
  }
}

module.exports = BaseRepository;
