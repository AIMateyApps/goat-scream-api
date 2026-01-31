const GoatScream = require('../models/GoatScream');

async function recordAccess(docs) {
  if (!docs || !docs.length) return;
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const operations = docs.map(doc => {
    const currentDate = doc.stats?.last_accessed_date;
    const update =
      currentDate === today
        ? {
            $set: { 'stats.last_accessed_at': now },
            $inc: { 'stats.api_calls': 1, 'stats.daily_hits': 1 },
          }
        : {
            $set: {
              'stats.last_accessed_at': now,
              'stats.last_accessed_date': today,
              'stats.daily_hits': 1,
            },
            $inc: { 'stats.api_calls': 1 },
          };

    return {
      updateOne: {
        filter: { _id: doc._id },
        update,
      },
    };
  });

  await GoatScream.bulkWrite(operations, { ordered: false });
}

module.exports = { recordAccess };
