import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // A fresh repo has no tests yet; without this the first run exits 1 ("No test files found").
    passWithNoTests: true,
    include: ['tests/integration/**/*.int.test.ts'],
    // One shared database: files must not race each other's writes.
    fileParallelism: false,
  },
})
