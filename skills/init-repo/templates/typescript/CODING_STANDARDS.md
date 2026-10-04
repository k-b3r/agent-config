# Coding Standards

Project layer on top of the global [k-b3r/agent-config standards](https://github.com/k-b3r/agent-config/blob/main/CODING_STANDARDS.md): same sections and tags, only what's specific to this repo. Generic rules live there, not here. This file wins on conflict. When in doubt, match surrounding code.

## Workflow

- `tool` Canonical check: `pnpm check` (format, lint, depcruise, knip, typecheck, unit tests), run by the lefthook pre-push hook.
- `tool` CI: `k-b3r/agent-config` `ci-typescript.yml` (static checks incl. `repo-checks` and gitleaks, unit, integration, e2e) + `pr-review.yml` (agent review and gate). `pnpm exec repo-checks audit` fails if any of it is unwired.

## Architecture

<!-- Folder layout and what lives where, e.g.
src/modules/    features, each with index.ts as its public API
src/platform/   shared infra (db, logger, settings, delay)
src/workers/    entry points: wire deps + loop
-->

- `tool` Module boundaries: `.dependency-cruiser.cjs` (shared `baseRules`) + ESLint.

## Testing

- `tool` Integration tests read only `TEST_DATABASE_URL` (`repo-checks test-db-env`).
