const { baseRules, baseOptions } = require('@k-b3r/agent-config/dependency-cruiser')

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...baseRules({
      // Each feature module's index.ts is its only entry from outside.
      publicApis: [],
      // Heavy or side-effecting packages and the one file allowed to import each.
      heavyDeps: [{ packages: ['pg'], owner: 'src/platform/db.ts' }],
      inner: ['src/modules', 'src/platform'],
      entryPoints: ['src/workers'],
    }),
    // Repo-specific rules go here.
  ],
  options: baseOptions(),
}
