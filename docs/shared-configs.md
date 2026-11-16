# Shared configs

What `@k-b3r/agent-config` gives a repo that installs it. Install and the two config snippets: [README](../README.md#shared-configs).

## Boundaries (dependency-cruiser)

Each config's options are documented in its file. `moduleTiers` (dependency-cruiser) lists modules lowest tier first: a module imports only lower tiers, so cycles can't form, and an unlisted module fails.

## Opt-in lint rules (eslint)

Opt-in `baseConfig` options enforce the mechanical half of three `tool`+`review` rules: `parameterizedSqlFiles` (+ `sqlFragment`) bans interpolating anything but constant SQL fragments into `.query()` text, `noConsoleFiles` bans `console.*` in domain code, and `pureCorePaths` bans `new Date()`, `Date.now()`, `Math.random()`, `fetch` and `process` in the pure core.

## repo-checks

`repo-checks` (bin) covers the `tool` rules no linter fits: `review-tier <base>` prints which reviewer a PR needs (see [review.md](review.md)); commit subjects, escape-hatch and untested-module ratchets, test placement, entry scripts, test DB env, tests that run git have a setup file clearing the `GIT_*` hook variables (`git-test-env`), workflow permissions (no `write-all`), contract tests never edited (`contracts-unmodified`; label `contract-change-approved` waives it), no added skipped or `.only` test (`skip-only`, `agentConfig.skipPatterns`), changed-file listing for the report-only mutation job (`mutation-targets`, `agentConfig.mutationPaths`), PR size (`diff-size`: `agentConfig.maxDiffLines`, default 800; lockfiles, `generatedPaths` and blocks of lines moved between files don't count; label `large-diff-approved` waives it), and `audit` (fails on any shared check the repo hasn't wired).

Settings: `package.json` `"agentConfig"`; commands: header of `scripts/repo-checks.mjs`.

## Test database helper

`@k-b3r/agent-config/test-db` exports `testDatabaseUrl()` (and `assertTestDatabase(url)`): integration tests that reset the database take their URL from it, and it throws unless the database name contains `test` (`test-db-env` checks the variable name, not what it points at).
