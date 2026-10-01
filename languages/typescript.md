# TypeScript

- `strict: true`, ES modules, `tsx` to run, Vitest (globals) to test.
- No semicolons, single quotes, 2-space indent, trailing commas in multiline literals.
- `import type` for type-only imports, kept on separate lines from value imports.
- `unknown` over `any`. Narrow external data explicitly (`typeof item?.id === 'string' ? ... : null`).
- Named exports. Domain folders expose a barrel `index.ts` (`export * from './x'`).
- Custom error subclasses for control flow that must unwind (`class QuotaExhaustedError extends Error {}`).
- Test files are siblings: `foo.ts` + `foo.test.ts`.
