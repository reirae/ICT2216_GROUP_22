// ESLint flat config for the SecureBank backend (CommonJS / Node).
// Lenient by design: it catches real mistakes (undefined vars, unreachable
// code) without failing CI on style nits, so the team can tighten rules later.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  // Things ESLint should never look at.
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'src/emails/**'],
  },

  // Application + script source (plain CommonJS .js files).
  {
    files: ['src/**/*.js', 'scripts/**/*.js', '*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Jest test files get the Jest globals (describe/test/expect, etc.).
  {
    files: ['tests/**/*.js', '**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
  },
];
