// Shared dependency-cruiser rules for the module-boundary `tool` rules of
// CODING_STANDARDS.md (Design) and languages/typescript.md (Enforcement).
// A repo's .dependency-cruiser.cjs:
//   const { baseRules, baseOptions } = require('@k-b3r/agent-config/dependency-cruiser')
//   module.exports = { forbidden: [...baseRules({ ... }), ...repoRules], options: baseOptions({ ... }) }

const escape = (path) => path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const under = (dir) => `^${escape(dir.replace(/\/$/, ''))}/`
const exactly = (file) => `^${escape(file)}$`
// pnpm's store path also ends in node_modules/<pkg>/, so one form matches both layouts.
const npm = (pkg) => `node_modules/${escape(pkg)}/`
const slug = (path) => path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')

const DEFAULT_TEST_FILES = ['\\.test\\.tsx?$', '\\.spec\\.tsx?$', '^tests/', '\\.config\\.[cm]?ts$']

/**
 * @param {object} options
 * @param {string[]} [options.publicApis] folders whose index.ts is their only entry from outside
 * @param {{ packages: string[], owner: string }[]} [options.heavyDeps] heavy or side-effecting packages and the one file allowed to import them
 * @param {string[]} [options.inner] folders holding domain logic (modules, domains, platform)
 * @param {string[]} [options.entryPoints] folders of composition roots (workers, scripts, server); inner code never imports them
 * @param {string[]} [options.testFiles] path regexes exempt from the heavy-dep rule
 */
function baseRules({ publicApis = [], heavyDeps = [], inner = [], entryPoints = [], testFiles = DEFAULT_TEST_FILES }) {
  const owners = heavyDeps.map((dep) => exactly(dep.owner))
  return [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Runtime cycles make load order ambiguous.',
      from: {},
      to: { circular: true },
    },
    ...heavyDeps.flatMap((dep) =>
      dep.packages.map((pkg) => ({
        name: `heavy-dep-${slug(pkg)}`,
        severity: 'error',
        comment: `${pkg} is heavy or side-effecting: only ${dep.owner} imports it, everything else goes through that file.`,
        from: { pathNot: [exactly(dep.owner), ...testFiles] },
        to: { path: npm(pkg) },
      })),
    ),
    ...(owners.length && publicApis.length
      ? [
          {
            name: 'index-stays-light',
            severity: 'error',
            comment: "Importing a folder's public API must never load a heavy dep; expose it from its own entry file.",
            from: { path: publicApis.map((dir) => `${under(dir)}index\\.[cm]?tsx?$`) },
            to: { path: owners, reachable: true },
          },
        ]
      : []),
    // Heavy-dep owners are entry files of their own, reachable by path.
    ...publicApis.map((dir) => ({
      name: `no-deep-imports-into-${slug(dir)}`,
      severity: 'error',
      comment: `Callers outside ${dir} use its index.ts; files inside import each other directly.`,
      from: { pathNot: under(dir) },
      to: { path: under(dir), pathNot: [`${under(dir)}index\\.[cm]?tsx?$`, ...owners] },
    })),
    ...(inner.length && entryPoints.length
      ? [
          {
            name: 'inner-does-not-import-entry-points',
            severity: 'error',
            comment: 'Domain code decides; entry points wire and loop. Dependencies point inward only.',
            from: { path: inner.map(under) },
            to: { path: entryPoints.map(under) },
          },
        ]
      : []),
  ]
}

/**
 * @param {object} [options]
 * @param {string} [options.tsConfig] path to the tsconfig used for resolution
 * @param {string[]} [options.exclude] path regexes left out of the graph (other apps, fixtures)
 */
function baseOptions({ tsConfig = 'tsconfig.json', exclude = [] } = {}) {
  return {
    doNotFollow: { path: 'node_modules' },
    ...(exclude.length ? { exclude: { path: exclude } } : {}),
    tsConfig: { fileName: tsConfig },
    // Runtime graph: `import type` is erased at compile time, so it never loads a
    // heavy dep or closes a load-order cycle. Type leaks past index.ts are left to review.
    tsPreCompilationDeps: false,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  }
}

module.exports = { baseRules, baseOptions }
