import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // A fresh repo has no tests yet; without this the first run exits 1 ("No test files found").
    passWithNoTests: true,
    exclude: ['**/node_modules/**', '.claude/**', '.stryker-tmp/**', '**/*.int.test.ts', 'tests/e2e/**'],
  },
})
