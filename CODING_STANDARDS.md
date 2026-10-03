# Coding Standards

Language-agnostic rules for every project. Sections marked *Examples* link to do/don't snippets in `~/.claude/standards/`; read the file before working in that area. A repo's own `CODING_STANDARDS.md` wins on conflict. When in doubt, match surrounding code.

Tags (what CI can check): `tool` = deterministic check, blocks the PR. `hint` = tool proxy, warns only. `review` = judgment, agent or human review. `process` = how the agent works, not checkable from code. `tool`+`review` = part checkable, part judgment. Untagged principles (Philosophy) guide review.

## Philosophy

- Complexity is the enemy: anything that makes code hard to understand or change. Symptoms: change amplification, cognitive load, unknown unknowns.
- Strategic over tactical. Working code isn't enough; every change should leave the design a little better.
- YAGNI: build for today's need, keep it easy to change tomorrow.

## Workflow

- `process` Low ceremony. Design in conversation, implement directly, commit. Write a spec only when the design has real ambiguity. Full plans and multi-agent review only for large, parallel, or risky work.
- `process` New features with unclear shape (new data model, several modules, unknown APIs) go through `/spike-and-rebuild`: plan as committed stubs, throwaway spike, fresh-context review from git evidence, then TDD rebuild. Bug fixes and small changes skip it.
- `tool` Every change reaches `main` through a pull request. Never push to `main` directly. _(branch protection; needs paid plan on private repos)_
- `tool` Run the project's canonical check (e.g. `pnpm check`) before opening or updating a PR. _(pre-push hook)_
- `tool` A PR merges only when CI is green: format, lint, typecheck, unit, integration, e2e, agent review, and the review gate. _(required status checks)_
- `process` When the agent review labels a PR `needs-human`, stop and get the human decision; never add `human-approved` yourself.

## Architecture

- `process` Default: modular monolith. One codebase, one deploy, modules split by feature, each owning its logic, data access, and queries behind one public entry point. Several processes (workers, server, UI) can share it as entry points.
- `process` Before applying the default, run the fit check; the first yes picks the shape:
  1. Fewer than 3 distinct features with their own data? Flat: one module, no boundaries.
  2. Mostly a library or SDK? Design the public API first; internals follow it.
  3. Mostly a framework app (UI routes, components)? Follow the framework's conventions.
  4. Any part that must scale, deploy, fail, or run on a different runtime independently? Split out only that part as a service; the rest stays a monolith.
  5. Several teams with separate release cycles? Align module or service boundaries with teams.
  6. Event-driven or realtime core (chat, games, live trading)? Event or actor model for that core.
- `process` Data flowing through stages (collect, enrich, notify) is a runtime shape, not a reason to drop modules: stages become thin entry points that call feature modules.
- `review` Record the choice and the fit-check answer in the repo (ADR or `CONTEXT.md`) so it isn't relitigated.

## Design

- `review` Deep modules: simple interface, substantial functionality behind it. Avoid shallow pass-through layers and wrappers that add an interface without hiding anything.
- `review` Prefer deep modules over many small functions. Don't split a function just to make it shorter; split only when the piece is a coherent abstraction. Small private helpers inside a module are fine.
- `tool`+`review` Deep is not big. One module owns one concern; when a file mixes unrelated features (e.g. every query for every page), split it by feature. _(max-lines as hint; "one concern" is review)_
- `review` Group code by feature, not by technical layer, so one change lives in one folder.
- `tool`+`review` Importing a module must be cheap and side-effect free: no connections, network calls, or heavy work at import time. _(dependency-cruiser bans DB/network/heavy deps in shared modules)_
- `tool` Enforce module boundaries with tooling in CI, not prose alone: ban wildcard re-exports, forbid heavy deps leaking into shared entry points, forbid import cycles. Tool specifics in the language guide. _(see language guide)_
- `tool`+`review` Hide information. Each module owns its decisions; callers never depend on internals. _(no deep imports past index)_
- `review` Pull complexity downward: the module absorbs hard cases so callers stay simple.
- `review` Define errors out of existence where possible (APIs whose normal semantics cover the edge case) instead of adding exceptions callers must handle.
- `review` Design it twice: consider one alternative before committing to an interface.
- `tool`+`review` Minimize parameters: derive any value the function can work out from what it's given. Inject outside-world dependencies; never derive from ambient state (globals, singletons, env). Pass a whole object when the function works on that entity, a single value when it's a utility. _(env/global reads banned outside entry points; parameter count is review)_
- `review` New behavior is gated behind a setting that defaults to today's behavior. Shipping a feature must not disrupt existing flows.

*Examples:* `~/.claude/standards/design.md`

### Structure

- `review` Keep domain logic out of entry points: workers/handlers wire dependencies and loop, domains decide.
- `tool` Every runnable script gets a named command in the project's task runner (e.g. `package.json` script, `Makefile` target). _(script: every entry file has a task-runner command)_

## Writing Code

- `review` Tunables as named constants at top of file (`MAX_ATTEMPTS`, `RETRY_DELAY_MS`). Runtime-adjustable ones live in config/DB settings with code defaults as fallback.
- `tool`+`review` Treat external data as untrusted: validate and narrow it at the boundary. _(strict types force narrowing; validation quality is review)_

### Naming and Comments

- `review` Comments carry what code can't: interface contracts, intent, and *why*. If a comment explains *what*, improve the names instead.
- `review` No comments on obvious code.
- `review` Include evidence and date when a choice came from a live observation (`Confirmed live 2026-09-24: ...`).
- `review` Cross-reference sibling code that follows the same rule instead of re-explaining (`same rule as the sub-category backfill`).

*Examples:* `~/.claude/standards/comments.md`

## Refactoring

- `review` Refactor in small, behavior-preserving steps with tests green between each. Separate refactoring commits from behavior changes.
- `hint` Code smells (duplication, long parameter lists, feature envy, shotgun surgery) trigger refactoring; fix when touching the code, not in big-bang rewrites. _(jscpd, complexity, max-params)_

*Examples:* `~/.claude/standards/refactoring.md`

### Rename Safety

- `process` Search separately for every kind of reference (types, strings, dynamic lookups, re-exports, config, tests); one grep always misses something. Checklist in `refactoring.md`.

## Language Guidelines

Read the matching file before writing code in that language:

- TypeScript: `~/.claude/languages/typescript.md`

## Testing

- `tool`+`review` TDD by default: red, green, refactor. Every module gets a test file. _(test file exists per module is tool; TDD order is process)_
- `tool` Test placement (default, unless the language's tooling dictates otherwise): _(script)_
  - Unit tests sit next to the module they test (`foo.ts` + `foo.test.ts`), so they move and die with it.
  - Integration and e2e tests (real DB, several modules, full flows) live in top-level `tests/integration/` and `tests/e2e/`; they belong to no single file.
- `tool`+`review` Inject dependencies as params (db client, logger, delay fn, API clients). No hidden singletons. _(ban top-level clients/pools in domain code)_
- `review` Keep injected interfaces minimal (a db client is one `query` method) so tests fake them in a few lines.
- `tool` Real sleeps go through an injectable delay; tests pass a no-op. _(ban setTimeout outside the delay util)_
- `review` Test names are full sentences describing behavior: `'loadSettings falls back to defaults for a key missing from the table'`.
- `review` Assert on query shape and params where the query itself is the contract.
- `tool` Integration and e2e tests run against a disposable database from a test-only env var, never the one apps use, so a test can't touch prod. _(ban app DB env var in tests/)_

*Examples:* `~/.claude/standards/testing.md`

## Debugging

- `process` Diagnose with real data before deciding. Prefer LLM per-item passes over brittle heuristics for fuzzy classification.
- `process` When stuck after 3 attempts: stop, write down what failed, ask.

## Version Control

- `tool` Imperative, lowercase, concise, no trailing period: `add real estate page`, `fix reviewed products resurfacing in needs-review queue`. _(commitlint)_
- `tool`+`review` One logical change per commit. Feature branches merge with `merge <branch>`. _(merge message format is tool; one logical change is review)_
- `tool` Never commit a broken build or failing tests. Never `--no-verify`, never force-push `main`. _(CI + no-verify bypass caught by required checks)_
- `tool` No AI attribution: no `Co-Authored-By` trailers in commits, no "Generated with" lines in PR descriptions. _(commitlint / grep)_
- `tool` Never hand-edit generated files (lockfiles, CHANGELOG, generated clients, files marked `DO NOT EDIT` / `@generated`). Change the source, rerun the generator. _(rerun generators, git diff --exit-code; pnpm install --frozen-lockfile)_

## Resilience

- `review` External calls retry with bounded attempts and delay, then degrade (halve the batch, skip the item) instead of crashing the run.
- `review` Distinguish fatal (e.g. 429 quota) from transient errors. Fatal unwinds, transient retries.
- `review` Log every skip or degradation with id and reason. Never lose data silently: unprocessed items stay candidates for the next run.

*Examples:* `~/.claude/standards/resilience.md`

## External Services

- `review` Be a polite, low-volume client. Pace requests against rate-sensitive targets: no rapid ad-hoc probing, batch checks into one run.
- `review` Respect robots.txt and ToS. Don't scrape sources that forbid it.
- `review` $0 budget default: prefer free tiers, self-hosting, and round-robin keys over paid services.

## Data

- `review` Derive at query time instead of storing (e.g. ratios like price per sqm). Store raw inputs.
- `review` Feature-specific data goes in side tables (1:1, cascade delete) rather than widening core tables.

*Examples:* `~/.claude/standards/data.md`
