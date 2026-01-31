const MongoScreamsRepository = require('./mongoScreamsRepository');
const StaticScreamsRepository = require('./staticScreamsRepository');
const { getDbStatus } = require('../db/connection');

/**
 * Factory function to get the appropriate repository based on DB connection status
 * @returns {BaseRepository} Repository instance
 */
function getScreamsRepository() {
  const db = getDbStatus();
  if (db.connected) {
    return new MongoScreamsRepository();
  }
  return new StaticScreamsRepository();
}

module.exports = {
  MongoScreamsRepository,
  StaticScreamsRepository,
  getScreamsRepository,
};
