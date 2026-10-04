# TypeScript

Tags as in `CODING_STANDARDS.md`.

- `tool` `strict: true`, ES modules, `tsx` to run, Vitest (globals) to test. _(tsconfig check)_
- `tool` No semicolons, single quotes, 2-space indent, trailing commas in multiline literals. _(formatter)_
- `tool` `import type` for type-only imports, kept on separate lines from value imports. _(consistent-type-imports)_
- `tool` `unknown` over `any`. Narrow external data explicitly (`typeof item?.id === 'string' ? ... : null`). _(no-explicit-any)_
- `tool` Named exports only. _(no-default-export; framework-required defaults excepted, e.g. Next.js pages)_
- `tool` A folder's `index.ts` is its public API: explicit named exports only, never `export *`. Callers outside the folder import from `index.ts`; files inside import each other directly. _(see Enforcement)_
- `tool` Keep heavy or side-effecting modules (browser automation, native image libraries, DB pools) out of shared `index.ts` files; expose them from their own entry point so importing a light function never loads them. _(see Enforcement)_
- `review` Custom error subclasses for control flow that must unwind (`class QuotaExhaustedError extends Error {}`).
- `tool` Unit test files are siblings: `foo.ts` + `foo.test.ts`; integration/e2e under `tests/`. _(script)_

## Enforcement (wire into CI)

Shared, referenced from `@k-b3r/agent-config` (git dependency) so repos don't drift; `/init-repo` wires all of it and `repo-checks audit` fails on any piece missing.

| Rule | Check |
|---|---|
| no `export *`, named exports only, no ambient env outside entry points, no inline sleeps, `ban-ts-comment`, `no-explicit-any`, `eslint-disable` with reason, `import type`, floating promises | `@k-b3r/agent-config/eslint` `baseConfig` |
| size/params/complexity smells (`hint`) | same, as warnings |
| no cycles, heavy deps only via their owner, `index.ts` stays light, no deep imports, domains never import entry points | `@k-b3r/agent-config/dependency-cruiser` `baseRules` |
| escape-hatch ratchet, untested-module ratchet, test placement, entry scripts, test DB env, commit subjects | `repo-checks` |
| dead code | knip |
| secrets | gitleaks in `ci-typescript.yml` |
| canonical check before push | lefthook pre-push runs `pnpm check` |

- Each shared rule has a violating fixture plus a clean control in agent-config's tests; a repo's own extra rules keep their own fixtures (`tests/lint-fixtures/`), so a mis-scoped glob can't silently check nothing.
- Adopt rules on existing code by ratchet: block new violations, fix old ones when touching the code.
