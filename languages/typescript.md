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

- ESLint `no-restricted-syntax` on `ExportAllDeclaration`: bans `export *`.
- `dependency-cruiser` (or `eslint-plugin-boundaries`): forbid domain/shared code importing heavy deps (e.g. `playwright`, `sharp`) outside their own entry module; forbid deep imports past a folder's `index.ts` from outside it.
- `import/no-cycle` (or dependency-cruiser `no-circular`): no import cycles.
