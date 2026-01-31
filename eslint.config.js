const js = require('@eslint/js');
const jestPlugin = require('eslint-plugin-jest');
const prettierConfig = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    // Ignore internal tools directory
    ignores: ['.internal/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      jest: jestPlugin,
    },
    rules: {
      // Disallow console.* in production code (logger.js exceptions handled via overrides)
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Prefer const/let over var
      'no-var': 'error',
      'prefer-const': 'warn',
      // Consistent return statements
      'consistent-return': 'off', // Express routes don't always return
      // Allow variables prefixed with _ to be unused (common pattern for intentionally unused vars)
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Jest plugin recommended rules
      ...jestPlugin.configs.recommended.rules,
    },
  },
  {
    // Allow console.* in logger.js (intentional fallback)
    files: ['src/utils/logger.js'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Scripts can use console.*
    files: ['scripts/**/*.js', 'server.js'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Browser files in public/ and site/ directories
    files: ['public/**/*.js', 'site/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-console': 'off', // Browser console is fine
    },
  },
  prettierConfig,
];
