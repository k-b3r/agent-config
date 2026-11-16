// Lint for this repo's own scripts, hooks and pi extensions (plain Node, no TypeScript).
// Not the shared config: configs/eslint.mjs is what consumer repos import, and it is typed-TS only.
import js from '@eslint/js'
import globals from 'globals'

export default [
  // Fixtures and seeds break rules on purpose; the init-repo template is linted in the repo it is copied to.
  { ignores: ['**/node_modules/**', 'configs/fixtures/**', 'review-seeds/**', 'skills/init-repo/templates/**'] },
  js.configs.recommended,
  {
    languageOptions: { globals: globals.node, ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      // A leading underscore marks a binding that exists only to drop a key or skip a position.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
]
