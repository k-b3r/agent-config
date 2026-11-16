import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // A fresh repo has no tests yet; without this the first run exits 1 ("No test files found").
    passWithNoTests: true,
    // Clears GIT_DIR and friends, which git exports to the pre-push hook that runs this suite.
    setupFiles: ['./tests/setup/clear-git-env.ts'],
    include: ['tests/integration/**/*.int.test.ts'],
    // One shared database: files must not race each other's writes.
    fileParallelism: false,
  },
})
