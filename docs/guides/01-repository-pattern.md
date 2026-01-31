# Repository Pattern: Portable Data Access

Your API shouldn't care where data lives. MongoDB today, Postgres tomorrow, static files during outages. The repository pattern creates a contract that any data source can fulfill.

## Mental Model

A repository is a collection-like interface that hides storage details:

```
Service: "Give me screams where intensity > 7"
    ↓
Repository Interface: find(filter, options)
    ↓
┌─────────────────────────────────────────┐
│  MongoRepository    StaticRepository    │
│  - MongoDB query    - Array.filter()    │
│  - $sample          - Math.random()     │
│  - aggregate()      - Manual grouping   │
└─────────────────────────────────────────┘
```

The service speaks one language. Repositories translate to their native tongue.

## Copy This Pattern

```javascript
// repositories/baseRepository.js - Define the contract
class BaseRepository {
  async find(filter, options = {}) {
    throw new Error('find() must be implemented');
  }

  async findById(id) {
    throw new Error('findById() must be implemented');
  }

  async findRandom(filter, limit) {
    throw new Error('findRandom() must be implemented');
  }

  async count(filter) {
    throw new Error('count() must be implemented');
  }
}

module.exports = BaseRepository;
```

```javascript
// repositories/mongoRepository.js - MongoDB implementation
const BaseRepository = require('./baseRepository');
const Model = require('../models/Item');

class MongoRepository extends BaseRepository {
  async find(filter, options = {}) {
    const { sort, skip, limit, projection } = options;
    let query = Model.find(filter, projection).lean();

    if (sort) query = query.sort(sort);
    if (skip) query = query.skip(skip);
    if (limit) query = query.limit(limit);

    return query.exec();
  }

  async findById(id) {
    return Model.findOne({ id }).lean().exec();
  }

  async findRandom(filter, limit) {
    return Model.aggregate([{ $match: filter }, { $sample: { size: limit } }]).exec();
  }

  async count(filter) {
    return Model.countDocuments(filter).exec();
  }
}

module.exports = MongoRepository;
```

```javascript
// repositories/staticRepository.js - In-memory fallback
const BaseRepository = require('./baseRepository');

class StaticRepository extends BaseRepository {
  constructor(data) {
    super();
    this.data = data;
  }

  async find(filter, options = {}) {
    let result = this._applyFilter(this.data, filter);

    if (options.sort) result = this._applySort(result, options.sort);
    if (options.skip) result = result.slice(options.skip);
    if (options.limit) result = result.slice(0, options.limit);

    return result.map(item => ({ ...item })); // Clone to prevent mutation
  }

  async findById(id) {
    const item = this.data.find(d => d.id === id);
    return item ? { ...item } : null;
  }

  async findRandom(filter, limit) {
    const filtered = this._applyFilter(this.data, filter);
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, limit).map(item => ({ ...item }));
  }

  async count(filter) {
    return this._applyFilter(this.data, filter).length;
  }

  _applyFilter(data, filter) {
    // Translate MongoDB filter syntax to array operations
    return data.filter(item => {
      for (const [key, value] of Object.entries(filter)) {
        if (item[key] !== value) return false;
      }
      return true;
    });
  }

  _applySort(data, sort) {
    return [...data].sort((a, b) => {
      for (const [field, direction] of Object.entries(sort)) {
        if (a[field] !== b[field]) {
          return direction === 1 ? (a[field] > b[field] ? 1 : -1) : a[field] < b[field] ? 1 : -1;
        }
      }
      return 0;
    });
  }
}

module.exports = StaticRepository;
```

```javascript
// repositories/index.js - Factory for runtime selection
const MongoRepository = require('./mongoRepository');
const StaticRepository = require('./staticRepository');
const staticData = require('../data/items.json');

function getRepository() {
  if (process.env.DB_CONNECTED === 'true') {
    return new MongoRepository();
  }
  return new StaticRepository(staticData);
}

module.exports = { getRepository, MongoRepository, StaticRepository };
```

## In This Repo

**Base contract:** `src/repositories/baseRepository.js:5-72`

Defines seven methods every repository must implement:

- `find(filter, options)` - Query with pagination
- `findById(id)` - Single document lookup
- `findRandom(filter, limit)` - Random sampling
- `count(filter)` - Document count
- `aggregate(pipeline)` - Complex queries
- `distinct(field, filter)` - Unique values
- `updateOne(filter, update)` - Modifications

**MongoDB implementation:** `src/repositories/mongoScreamsRepository.js:45-151`

Uses Mongoose with circuit breaker protection:

```javascript
async find(filter, options = {}) {
  return withCircuitBreaker(async () => {
    let query = GoatScream.find(filter, projection).lean();
    // ... sort, skip, limit
    return query.exec();
  });
}
```

**Static implementation:** `src/repositories/staticScreamsRepository.js:9-311`

Translates MongoDB-style filters to array operations:

```javascript
_mongoFilterToQuery(filter) {
  const query = {};
  if (filter['audio.intensity']) {
    const intensity = filter['audio.intensity'];
    if (intensity.$gte !== undefined) query.intensity_min = intensity.$gte.toString();
  }
  // ... more translations
  return query;
}
```

**Factory function:** `src/repositories/index.js:9-15`

```javascript
function getScreamsRepository() {
  const db = getDbStatus();
  if (db.connected) {
    return new MongoScreamsRepository();
  }
  return new StaticScreamsRepository();
}
```

**Search pattern:** `grep -r "extends BaseRepository" src/`

## Try It

Create a mock repository for testing:

1. Create `tests/mocks/mockScreamsRepository.js`:

   ```javascript
   const BaseRepository = require('../../src/repositories/baseRepository');

   class MockScreamsRepository extends BaseRepository {
     constructor(mockData = []) {
       super();
       this.data = mockData;
       this.calls = []; // Track method calls
     }

     async find(filter, options) {
       this.calls.push({ method: 'find', filter, options });
       return this.data.slice(0, options.limit || 10);
     }

     async findById(id) {
       this.calls.push({ method: 'findById', id });
       return this.data.find(d => d.id === id) || null;
     }

     async count(filter) {
       this.calls.push({ method: 'count', filter });
       return this.data.length;
     }

     async findRandom(filter, limit) {
       this.calls.push({ method: 'findRandom', filter, limit });
       return this.data.slice(0, limit);
     }
   }

   module.exports = MockScreamsRepository;
   ```

2. Use it in a test:

   ```javascript
   const ScreamsService = require('../../src/services/screamsService');
   const MockRepo = require('../mocks/mockScreamsRepository');

   describe('ScreamsService', () => {
     it('respects pagination limits', async () => {
       const mockData = Array.from({ length: 50 }, (_, i) => ({ id: `scream-${i}` }));
       const repo = new MockRepo(mockData);
       const service = new ScreamsService(repo);

       await service.getScreams({ limit: '10', page: '1' });

       expect(repo.calls[0].options.limit).toBe(10);
     });
   });
   ```

3. Run: `pnpm test -- tests/mocks`

## Debugging Checklist

| Symptom                           | Check                                                     |
| --------------------------------- | --------------------------------------------------------- |
| "find() must be implemented"      | Subclass didn't override method                           |
| Different results mongo vs static | Filter translation in `_mongoFilterToQuery`               |
| Mutations affecting other tests   | Repository not cloning returned objects                   |
| Wrong repository selected         | Factory function checking correct env var                 |
| Aggregation returns empty         | Static implementation doesn't support that pipeline stage |

## FAQ

**Q: Why use a factory function instead of dependency injection?**

A: The factory allows runtime switching. This API falls back to static data when MongoDB is unavailable, checked on every request. DI would require restart to switch.

**Q: Should repositories handle validation?**

A: No. Validation belongs in services. Repositories assume they receive valid data and focus solely on storage operations.

**Q: How do I handle transactions across repositories?**

A: Create a Unit of Work pattern that coordinates multiple repositories. For most APIs, single-repository operations are sufficient.

**Q: What about caching?**

A: Caching can live in the service layer (see Guide 04) or as a repository decorator. This repo caches at the service level for simplicity.

**Q: How complete does the static implementation need to be?**

A: Match the features you actually use. This repo's static repository supports filtering, sorting, pagination, basic aggregation, and random sampling - enough for a read-only fallback.

## Further Reading

- Martin Fowler: [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)
- Mongoose: [Queries](https://mongoosejs.com/docs/queries.html)
- Node.js Design Patterns: [Dependency Injection](https://www.nodejsdesignpatterns.com/)

## Next Guide

[02-custom-error-hierarchy.md](./02-custom-error-hierarchy.md) - Design error classes that make debugging easier and API responses consistent.
