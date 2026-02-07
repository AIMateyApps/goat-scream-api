# Contributing to Goat Screams API

Thanks for your interest in contributing! This project is a joyful, open API for goat screams, and we welcome contributions that make it more fun and accessible.

## Quick Start

1. Fork the repository
2. Clone your fork: `git clone https://github.com/AIMateyApps/goat-scream-api.git`
3. Install dependencies: `pnpm install`
4. Start the dev server: `pnpm run dev`

The API runs on `http://localhost:3000` and serves a static JSON snapshot by default (no database required).

## Ways to Contribute

### 🐐 Adding Goat Screams

The easiest way to contribute is by adding new goat screams to the catalog. See [`docs/contributing-screams.md`](docs/contributing-screams.md) for the full guide.

**Quick version:**

1. Submit a scream via `/api/submissions` (when Advanced API is enabled) or submit a PR with curated data
2. Include proper licensing information
3. Provide metadata (title, tags, intensity, context)

### 🐛 Bug Reports

Found a bug? Open an issue with:

- Description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Any relevant error messages

### 💡 Feature Ideas

Have an idea? Open an issue describing:

- What you want to add
- Why it would be useful
- How it fits with the project's "fun-first" philosophy

### 📝 Documentation

Documentation improvements are always welcome! Check out:

- [`docs/api-guide.md`](docs/api-guide.md) - API usage guide
- [`docs/enable-advanced-api.md`](docs/enable-advanced-api.md) - Advanced setup
- [`README.md`](README.md) - Main readme

### 🧪 Testing

We use Jest + Supertest for testing. Run tests with:

```bash
pnpm test
```

Tests use `mongodb-memory-server` and mock Cloudinary, so no external dependencies are required.

## Development Guidelines

### Code Style

- Use CommonJS (`require`/`module.exports`)
- 2-space indentation
- camelCase for functions/variables, PascalCase for models
- Route files should be kebab-case (e.g., `screams.js`)

### Pre-commit Hooks

This project uses Husky and lint-staged to automatically run linting and formatting before commits:

- **ESLint** runs on all staged `.js` files
- **Prettier** formats all staged `.js`, `.json`, and `.md` files
- Commits will be blocked if linting fails

To bypass hooks (not recommended): `git commit --no-verify`

### Running Linters

```bash
pnpm run lint        # Check for linting errors
pnpm run lint:fix    # Auto-fix linting errors
pnpm run format       # Format all files
pnpm run format:check # Check formatting without changing files
```

### Commit Messages

Follow concise, sentence-case commit subjects:

- `Add new endpoint for scream intensity filtering`
- `Fix rate limiting bug in API key middleware`
- `Update documentation for submission workflow`

### Pull Requests

1. Create a branch from `main`
2. Make your changes
3. Run tests: `pnpm test`
4. Update documentation if needed
5. Submit a PR with a clear description

### Environment Setup

For basic API development, no environment variables are needed. The API serves from `data/screams-public.json`.

For Advanced API features (submissions, moderation), see [`docs/enable-advanced-api.md`](docs/enable-advanced-api.md).

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

- Check the [`docs/`](docs/) directory for detailed guides
- Open an issue for questions or discussions
- Review [`docs/roadmap.md`](docs/roadmap.md) to see what's planned

Happy bleating! 🐐
