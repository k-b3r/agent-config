# Coding Standards

Language-agnostic rules for every project. Sections marked *Examples* link to do/don't snippets in `~/.claude/standards/`; read the file before working in that area. A repo's own `CODING_STANDARDS.md` wins on conflict. When in doubt, match surrounding code.

## Philosophy

- Complexity is the enemy: anything that makes code hard to understand or change. Symptoms: change amplification, cognitive load, unknown unknowns.
- Strategic over tactical. Working code isn't enough; every change should leave the design a little better.
- YAGNI: build for today's need, keep it easy to change tomorrow.

## Workflow

- Low ceremony. Design in conversation, implement directly, commit. Write a spec only when the design has real ambiguity. Full plans and multi-agent review only for large, parallel, or risky work.
- Every change reaches `main` through a pull request. Never push to `main` directly.
- Run the project's canonical check (e.g. `pnpm check`) before opening or updating a PR.
- A PR merges only when CI is green: format, lint, typecheck, unit, integration, e2e, agent review, and the review gate.
- When the agent review labels a PR `needs-human`, stop and get the human decision; never add `human-approved` yourself.

## Design

- Deep modules: simple interface, substantial functionality behind it. Avoid shallow pass-through layers and wrappers that add an interface without hiding anything.
- Prefer deep modules over many small functions. Don't split a function just to make it shorter; split only when the piece is a coherent abstraction. Small private helpers inside a module are fine.
- Hide information. Each module owns its decisions; callers never depend on internals.
- Pull complexity downward: the module absorbs hard cases so callers stay simple.
- Define errors out of existence where possible (APIs whose normal semantics cover the edge case) instead of adding exceptions callers must handle.
- Design it twice: consider one alternative before committing to an interface.
- Minimize parameters: derive any value the function can work out from what it's given. Inject outside-world dependencies; never derive from ambient state (globals, singletons, env). Pass a whole object when the function works on that entity, a single value when it's a utility.
- New behavior is gated behind a setting that defaults to today's behavior. Shipping a feature must not disrupt existing flows.

*Examples:* `~/.claude/standards/design.md`

### Structure

- Keep domain logic out of entry points: workers/handlers wire dependencies and loop, domains decide.
- Every runnable script gets a named command in the project's task runner (e.g. `package.json` script, `Makefile` target).

## Writing Code

- Tunables as named constants at top of file (`MAX_ATTEMPTS`, `RETRY_DELAY_MS`). Runtime-adjustable ones live in config/DB settings with code defaults as fallback.
- Treat external data as untrusted: validate and narrow it at the boundary.

### Naming and Comments

- Comments carry what code can't: interface contracts, intent, and *why*. If a comment explains *what*, improve the names instead.
- No comments on obvious code.
- Include evidence and date when a choice came from a live observation (`Confirmed live 2026-09-24: ...`).
- Cross-reference sibling code that follows the same rule instead of re-explaining (`same rule as the sub-category backfill`).

*Examples:* `~/.claude/standards/comments.md`

## Refactoring

- Refactor in small, behavior-preserving steps with tests green between each. Separate refactoring commits from behavior changes.
- Code smells (duplication, long parameter lists, feature envy, shotgun surgery) trigger refactoring; fix when touching the code, not in big-bang rewrites.

*Examples:* `~/.claude/standards/refactoring.md`

### Rename Safety

- Search separately for every kind of reference (types, strings, dynamic lookups, re-exports, config, tests); one grep always misses something. Checklist in `refactoring.md`.

## Language Guidelines

Read the matching file before writing code in that language:

- TypeScript: `~/.claude/languages/typescript.md`

## Testing

- TDD by default: red, green, refactor. Every module gets a test file.
- Test placement (default, unless the language's tooling dictates otherwise):
  - Unit tests sit next to the module they test (`foo.ts` + `foo.test.ts`), so they move and die with it.
  - Integration and e2e tests (real DB, several modules, full flows) live in top-level `tests/integration/` and `tests/e2e/`; they belong to no single file.
- Inject dependencies as params (db client, logger, delay fn, API clients). No hidden singletons.
- Keep injected interfaces minimal (a db client is one `query` method) so tests fake them in a few lines.
- Real sleeps go through an injectable delay; tests pass a no-op.
- Test names are full sentences describing behavior: `'loadSettings falls back to defaults for a key missing from the table'`.
- Assert on query shape and params where the query itself is the contract.
- Integration and e2e tests run against a disposable database from a test-only env var, never the one apps use, so a test can't touch prod.

*Examples:* `~/.claude/standards/testing.md`

## Debugging

- Diagnose with real data before deciding. Prefer LLM per-item passes over brittle heuristics for fuzzy classification.
- When stuck after 3 attempts: stop, write down what failed, ask.

## Version Control

- Imperative, lowercase, concise, no trailing period: `add real estate page`, `fix reviewed products resurfacing in needs-review queue`.
- One logical change per commit. Feature branches merge with `merge <branch>`.
- Never commit a broken build or failing tests. Never `--no-verify`, never force-push `main`.
- No AI attribution: no `Co-Authored-By` trailers in commits, no "Generated with" lines in PR descriptions.
- Never hand-edit generated files (lockfiles, CHANGELOG, generated clients, files marked `DO NOT EDIT` / `@generated`). Change the source, rerun the generator.

## Resilience

- External calls retry with bounded attempts and delay, then degrade (halve the batch, skip the item) instead of crashing the run.
- Distinguish fatal (e.g. 429 quota) from transient errors. Fatal unwinds, transient retries.
- Log every skip or degradation with id and reason. Never lose data silently: unprocessed items stay candidates for the next run.

*Examples:* `~/.claude/standards/resilience.md`

## External Services

- Be a polite, low-volume client. Pace requests against rate-sensitive targets: no rapid ad-hoc probing, batch checks into one run.
- Respect robots.txt and ToS. Don't scrape sources that forbid it.
- $0 budget default: prefer free tiers, self-hosting, and round-robin keys over paid services.

## Data

- Derive at query time instead of storing (e.g. ratios like price per sqm). Store raw inputs.
- Feature-specific data goes in side tables (1:1, cascade delete) rather than widening core tables.

*Examples:* `~/.claude/standards/data.md`
