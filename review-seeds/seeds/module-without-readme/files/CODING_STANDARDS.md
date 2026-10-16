# Coding Standards

Project layer on top of the global k-b3r/agent-config standards. This file wins on conflict.

## Architecture

- Modular monolith: `src/modules/<feature>/`, each a feature folder with a `README.md`, an `index.ts` public API, `domain/` for pure code, and `store.ts` for its SQL.
- Pure code lives in `src/modules/*/domain/**` (`pureCorePaths`).
- Module tiers, lowest first: `catalog`, then `pricing`, then `inventory`. A module imports only lower tiers, through `index.ts`.
- `src/platform/` holds plumbing with no domain types: db client, logger, delay.
- Entry points: `src/workers/<name>/index.ts` only wires; the loop is the sibling `run.ts`. Routes live in `src/server/routes/`.
- Cross-module sequences live in the caller's `run.ts`; `src/processes/` appears when a second caller needs one.
