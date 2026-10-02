# TypeScript

- `strict: true`, ES modules, `tsx` to run, Vitest (globals) to test.
- No semicolons, single quotes, 2-space indent, trailing commas in multiline literals.
- `import type` for type-only imports, kept on separate lines from value imports.
- `unknown` over `any`. Narrow external data explicitly (`typeof item?.id === 'string' ? ... : null`).
- Named exports only.
- A folder's `index.ts` is its public API: explicit named exports only, never `export *`. Callers outside the folder import from `index.ts`; files inside import each other directly.
- Keep heavy or side-effecting modules (browser automation, native image libraries, DB pools) out of shared `index.ts` files; expose them from their own entry point so importing a light function never loads them.
- Custom error subclasses for control flow that must unwind (`class QuotaExhaustedError extends Error {}`).
- Test files are siblings: `foo.ts` + `foo.test.ts`.

## Enforcement (wire into CI)

- ESLint `no-restricted-syntax` on `ExportAllDeclaration`: bans `export *`.
- `dependency-cruiser` (or `eslint-plugin-boundaries`): forbid domain/shared code importing heavy deps (e.g. `playwright`, `sharp`) outside their own entry module; forbid deep imports past a folder's `index.ts` from outside it.
- `import/no-cycle` (or dependency-cruiser `no-circular`): no import cycles.
