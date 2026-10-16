import { baseConfig } from '@k-b3r/agent-config/eslint'

export default [
  ...baseConfig({
    tsconfigRootDir: import.meta.dirname,
    // Composition roots: the only files that read process.env.
    entryPoints: ['src/workers/*/index.ts'],
    // The injectable delay; the only place allowed to sleep.
    delayModules: ['src/platform/delay.ts'],
    // Pure decision code (no clock, randomness, fetch, process). Uncomment once the
    // architecture fit check has a domain folder, e.g. 'src/modules/*/domain/**'.
    // pureCorePaths: ['src/domain/**'],
  }),
  // Repo-specific blocks (framework plugins, extra bans) go here.
]
