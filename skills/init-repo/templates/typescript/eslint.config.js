import { baseConfig } from '@k-b3r/agent-config/eslint'

export default [
  ...baseConfig({
    tsconfigRootDir: import.meta.dirname,
    // Composition roots: the only files that read process.env.
    entryPoints: ['src/workers/*/index.ts'],
    // The injectable delay; the only place allowed to sleep.
    delayModules: ['src/platform/delay.ts'],
  }),
  // Repo-specific blocks (framework plugins, extra bans) go here.
]
