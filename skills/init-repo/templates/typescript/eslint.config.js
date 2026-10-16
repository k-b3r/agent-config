import { baseConfig } from '@k-b3r/agent-config/eslint'

export default [
  ...baseConfig({
    tsconfigRootDir: import.meta.dirname,
    // Composition roots: the only files that read process.env.
    entryPoints: ['src/workers/*/index.ts'],
    // The injectable delay; the only place allowed to sleep.
    delayModules: ['src/platform/delay.ts'],
    // Pure decision code (no clock, randomness, fetch, process). Uncomment once the
    // architecture fit check has modules; pure code always lives in a module's domain/.
    // pureCorePaths: ['src/modules/*/domain/**'],
  }),
  // Repo-specific blocks (framework plugins, extra bans) go here.
]
