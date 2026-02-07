# The Big Picture: Layered API Architecture

Production APIs aren't just route handlers. They're layered systems where each layer has a single job. This guide teaches you to read any Express codebase by recognizing these layers.

## Mental Model

Think of a request like a letter traveling through a company mailroom:

```
Request → Routes (receptionist) → Services (department) → Repositories (filing cabinet)
                                                                    ↓
Response ← Routes ← Services ← Repositories ← [Database or Static Files]
```

**Routes** accept HTTP requests and return HTTP responses. They don't know how data is stored.

**Services** contain business logic. They don't know about HTTP status codes or request objects.

**Repositories** handle data access. They don't know why the data is being requested.

This separation means you can swap MongoDB for Postgres without touching routes, or add REST alongside GraphQL without changing business logic.

## Copy This Pattern

```javascript
// routes/items.js - Thin HTTP handler
const express = require('express');
const router = express.Router();
const ItemsService = require('../services/itemsService');

const service = new ItemsService();

router.get('/', async (req, res, next) => {
  try {
    const result = await service.getItems(req.query);
    return res.json(result);
  } catch (err) {
    next(err); // Let error middleware handle it
  }
});

module.exports = router;
```

```javascript
// services/itemsService.js - Business logic
const { getItemsRepository } = require('../repositories');

class ItemsService {
  constructor(repository = null) {
    this._repository = repository; // Allow injection for testing
  }

  get repository() {
    return this._repository || getItemsRepository();
  }

  async getItems(query) {
    const limit = Math.min(parseInt(query.limit, 10) || 100, 500);
    const page = Math.max(1, parseInt(query.page, 10) || 1);

    const [items, total] = await Promise.all([
      this.repository.find({}, { skip: (page - 1) * limit, limit }),
      this.repository.count({}),
    ]);

    return { page, limit, total, items };
  }
}

module.exports = ItemsService;
```

```javascript
// repositories/index.js - Factory for runtime selection
const MongoRepository = require('./mongoRepository');
const StaticRepository = require('./staticRepository');

function getItemsRepository() {
  if (process.env.DATABASE_CONNECTED === 'true') {
    return new MongoRepository();
  }
  return new StaticRepository();
}

module.exports = { getItemsRepository };
```

## In This Repo

The layered architecture is visible in:

**Entry point:** `src/app.js:246-256` - Routes are mounted to the v1 router

```javascript
const v1Router = express.Router();
v1Router.use('/screams', require('./routes/screams'));
```

**Route layer:** `src/routes/screams.js:9-16` - Routes only call service methods

```javascript
router.get('/', async (req, res, next) => {
  try {
    const result = await screamsService.getScreams(req.query);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});
```

**Service layer:** `src/services/screamsService.js:34-69` - Business logic lives here

```javascript
async getScreams(query) {
  // Parsing, validation, pagination logic
  const filter = buildMongoFilter(query, { includeUnapproved });
  const [items, total] = await Promise.all([
    this.repository.find(filter, { sort, skip, limit }),
    this.repository.count(filter),
  ]);
  return { page, limit, total, items };
}
```

**Repository factory:** `src/repositories/index.js:9-15` - Runtime selection

```javascript
function getScreamsRepository() {
  const db = getDbStatus();
  if (db.connected) {
    return new MongoScreamsRepository();
  }
  return new StaticScreamsRepository();
}
```

**Search pattern:** Look for `require('../services/` in routes, `require('../repositories')` in services.

## Try It

Trace a request through all three layers:

1. Start the dev server: `pnpm run dev`

2. Add console.log statements to trace the flow:

   ```javascript
   // In src/routes/screams.js, line 10
   console.log('ROUTE: received request', req.query);

   // In src/services/screamsService.js, line 35
   console.log('SERVICE: getScreams called', query);

   // In src/repositories/staticScreamsRepository.js, line 21
   console.log('REPO: find called', filter, options);
   ```

3. Make a request: `curl "http://localhost:3000/api/v1/screams?limit=2"`

4. Observe the order: ROUTE → SERVICE → REPO

5. Remove the console.log statements when done.

## Debugging Checklist

| Symptom                            | Check                                                             |
| ---------------------------------- | ----------------------------------------------------------------- |
| 404 on valid endpoint              | Route mounted? Check `app.use('/api/v1', v1Router)` in app.js     |
| Empty response                     | Service returning data? Add console.log in service method         |
| Wrong data                         | Repository filter correct? Log the filter object before query     |
| "X is not a function"              | Constructor injection working? Check `this._repository`           |
| Works locally, fails in production | Environment-dependent repository selection? Check `getDbStatus()` |

## FAQ

**Q: Why not put business logic in routes?**

A: Routes become untestable. Testing HTTP handlers requires mocking `req`/`res`. Testing services requires only passing data in, checking data out.

**Q: Why not access the database directly from services?**

A: You lose swappability. This repo serves from static JSON files when MongoDB is unavailable. The service layer doesn't know or care which one is active.

**Q: When should I create a new layer?**

A: When the same logic appears in multiple routes. Extract to a service. When the same database operation appears in multiple services, extract to a repository method.

**Q: Is this overkill for small projects?**

A: The separation pays off immediately in testing. Even for a 3-endpoint API, services are easier to test than route handlers.

## Further Reading

- Express.js Guide: [Routing](https://expressjs.com/en/guide/routing.html)
- Martin Fowler: [Repository Pattern](https://martinfowler.com/eaaCatalog/repository.html)
- Node.js Best Practices: [Structure by Components](https://github.com/goldbergyoni/nodebestpractices#1-project-structure-practices)

## Next Guide

[01-repository-pattern.md](./01-repository-pattern.md) - Implement the repository pattern with interchangeable data sources.
