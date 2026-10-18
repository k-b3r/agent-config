# Coding Standards

Language-agnostic rules for every project. Sections marked *Examples* link to do/don't snippets in `~/.claude/standards/`; read the file before working in that area. A repo's own `CODING_STANDARDS.md` wins on conflict. When in doubt, match surrounding code.

Tags (what CI can check): `tool` = deterministic check, blocks the PR once the repo wires it (a local hook that `install.sh` or `/init-repo` wires counts); the parenthetical names the kind of check, the repo's own `CODING_STANDARDS.md` names the actual tool. Until wired, treat it as `review`. `hint` = tool proxy, warns only. `review` = judgment, agent or human review. `process` = how the agent works, not checkable from code. `tool`+`review` = part checkable, part judgment. Untagged principles (Philosophy) guide review. The CI agent review uses the tags to decide what to check, and a `review` violation in new code blocks the PR (`.github/workflows/pr-review.yml`). `tool` rules are one line here; the language guide's Enforcement table says how each is wired.

## Philosophy

- Complexity is the enemy: anything that makes code hard to understand or change. Symptoms: change amplification, cognitive load, unknown unknowns.
- Strategic over tactical. Working code isn't enough; every change should leave the design a little better.
- YAGNI: build for today's need, keep it easy to change tomorrow.

## Workflow

- `process` Ceremony scales with risk. Pick the lowest tier that fits:
  1. Bug fix or small change: implement directly with TDD, commit, PR.
  2. Design has real ambiguity: short spec first, then tier 1.
  3. Unclear shape (new data model, several modules, unknown APIs): `/spike-and-rebuild`.
  4. Large, parallel, or risky: full plan and multi-agent review.
  Every tier gets the same automatic gates (canonical check, CI, agent review); those are not ceremony you add.
- `process` Ambiguous request: present the interpretations and ask; don't pick one silently.
- `process` Before starting work that touches auth or permissions, money or payments, user data, a migration or data deletion, or infra, CI or secrets: stop and ask the human; don't guess. These are the PR risk boxes below.
- `tool` Every change reaches `main` through a pull request; never push to `main`. _(guard hook, branch protection)_
- `tool` New repos start from `/init-repo`; a missing shared check fails CI. _(`repo-checks audit`)_
- `tool` The canonical check (e.g. `pnpm check`) runs before every push. _(pre-push hook)_
- `process` Each check runs in one place: pre-push runs the canonical check, CI runs everything else. Don't run either by hand or re-run CI's checks locally, except once when setting up or retrofitting a repo (`/init-repo` runs `pnpm check` and `repo-checks audit` to prove the wiring); run targeted tests while iterating and regenerate generated files (CI can only verify them). After pushing, watch CI and fix what fails. Delegated-agent prompts follow the same rule.
- `tool` Every repo ships `.github/pull_request_template.md`. _(`repo-checks audit`)_
- `process` Every PR body fills the template in, including the risk boxes (auth, money, user data, migrations, infra). A ticked box means stop and get the human decision.
- `tool` A PR merges only when CI is green, including the agent review and its gate. _(required status checks)_
- `process` When the review labels a PR `needs-human`, stop and get the human decision; never add `human-approved` yourself (`/resolve-needs-human`).
- `process` Review findings are fixed on the PR's own branch, one commit per finding (`/address-pr-review`).
- `process` Anything found outside the task's scope (bug, smell, debt) becomes a ticket in the project's own tracker board the moment it's seen, linked from the PR; notes and memory are not a backlog. Confirm the connector is on the right workspace before any tracker write (a "not found" often means the wrong one); if the board is unreachable, queue the call in `TRACKER_OUTBOX.md` (in `.git/info/exclude`), tell the user, and never write to another board. Small tidy-ups (never a bug a user could hit) may wait in the held-findings list (`/ticket-held-findings`).

## Architecture

- `process` Default: modular monolith. One codebase, one deploy, modules split by feature, each owning its logic, data access, and queries behind one public entry point. Several processes (workers, server, UI) can share it as entry points.
- `process` Before applying the default, run the fit check; the first yes picks the shape:
  1. Fewer than 3 distinct features with their own data? Flat: one module, no boundaries.
  2. Mostly a library or SDK? Design the public API first; internals follow it.
  3. Mostly a framework app (UI routes, components)? Follow the framework's conventions.
  4. Any part that must scale, deploy, fail, or run on a different runtime independently? Split out only that part as a service; the rest stays a monolith.
  5. Several teams with separate release cycles? Align module or service boundaries with teams.
  6. Event-driven or realtime core (chat, games, live trading)? Event or actor model for that core.
- `review` Record the choice and the fit-check answer in the repo (ADR or `CONTEXT.md`) so it isn't relitigated.
- `review` A module is one feature folder: it owns that feature's logic, tables and public API, and nothing else. Each module has a `README.md` naming its features, the tables it owns, its public API and the layers it has. Elsewhere in these standards a unit that "owns one concern" is a file or function, not a module.
- `review` A module starts flat: `index.ts` (public API), pure decisions, shell and storage files beside it. Layer folders (`domain/`, `app/`, `store/`, `clients/`) are fine inside a module, since the module is already the feature, but each is added only when a trigger fires: about 6+ files, a second kind of leaf (DB and external API), or several use cases sharing rules. A layer that only forwards calls is deleted, not kept.
- `tool`+`review` Pure code lives where the repo's `CODING_STANDARDS.md` says, as a glob or a file list; `domain/` is the default for new repos. _(`pureCorePaths`)_
- `review` A module owns as many tables as its feature needs. Another module reaches them through the owner's `index.ts`, never with its own SQL against them.
- `tool`+`review` Modules import each other only through `index.ts`, and only from lower tiers: the repo lists its modules lowest tier first, a module never imports its own tier or a higher one, and an unlisted module fails. Shared code moves down into a lower module or `src/platform/`. _(`moduleTiers`)_
- `review` A sequence that spans modules lives in its caller's `run.ts`. When a second caller needs it, it moves to `src/processes/`, which sequences module calls but holds no business rules and is imported by entry points only, never by a module.
- `review` An adapter whose signature carries the module's domain types lives in that module. Generic plumbing (HTTP client, pool, logger, delay, clock) lives in `src/platform/` with no domain types or rules. Duplicate once, extract on the third use.

*Examples:* `~/.claude/standards/design.md` (Module layout)

## Design

- `review` Deep modules: simple interface, substantial functionality behind it. Avoid shallow pass-through layers and wrappers that add an interface without hiding anything.
- `review` Prefer deep modules over many small functions. Don't split a function just to make it shorter; split only when the piece is a coherent abstraction. Small private helpers inside a module are fine.
- `tool`+`review` Deep is not big. One file owns one concern; when a file mixes unrelated features (e.g. every query for every page), split it by feature. _(max-lines hint)_
- `review` Group code by feature, not by technical layer or pipeline stage, so one change lives in one folder. Layer folders inside one feature module (see Architecture) are fine; layer folders at the top of the repo are not.
- `tool`+`review` Importing a module must be cheap and side-effect free: no connections, network calls, or heavy work at import time. _(dependency-cruiser)_
- `tool` Module boundaries are enforced in CI, not prose: no wildcard re-exports, no heavy deps leaking into shared entry points, no cycles, no upward module imports. _(see language guide)_
- `tool`+`review` Hide information. Each module owns its decisions; callers never depend on internals. _(no deep imports past index)_
- `review` Pull complexity downward: the module absorbs hard cases so callers stay simple.
- `review` Define errors out of existence where possible (APIs whose normal semantics cover the edge case) instead of adding exceptions callers must handle.
- `review` Design it twice: consider one alternative before committing to an interface.
- `tool`+`review` Minimize parameters: derive any value the function can work out from what it's given. Inject outside-world dependencies; never derive from ambient state (globals, singletons, env). Pass a whole object when the function works on that entity, a single value when it's a utility. _(env/global reads banned outside entry points)_
- `tool`+`review` Functional core, imperative shell: pure logic takes data and returns data; I/O stays at the edges. _(`pureCorePaths` bans clock, randomness, `fetch`, `process`; the rest of "I/O" is review)_
- `review` Smell test: a function that needs mocks to unit test mixes logic with effects. Split the decision into a pure function and test that with plain input and output; the shell keeps one integration test.
- `review` Inject only I/O (db, network, clock, delay, model clients); pure logic takes plain data. Wire dependencies in one composition root per entry point. No DI containers, service locators, singletons, or in-process event buses.
- `review` Interfaces only at I/O boundaries (adapters); no one-implementation interfaces elsewhere. Strategies are plain functions. Composition over inheritance.
- `review` Use a design pattern when the code already has its shape (rule of three), not in advance. Simplest form first: a function before a class, a class before a hierarchy.
- `review` Make operations idempotent wherever retries or reruns can happen.
- `review` New behavior that changes what an existing flow does or spends is gated behind a setting that defaults to today's behavior. Purely additive code (a new endpoint, a new page nothing links to yet) needs no gate. Once the behavior is permanent, remove the gate with its setting, schema row and settings-page entry in a follow-up; a gate that is always on is dead code.

*Examples:* `~/.claude/standards/design.md`

### Structure

- `review` Keep domain logic out of entry points: workers, handlers and pipeline stages wire dependencies and loop, domains decide.
- `review` A worker or CLI entry point is a folder: `index.ts` only wires, and an optional sibling `run.ts` holds the loop, which may call several modules' public functions to sequence, batch, pace and retry. Decisions stay in the modules.
- `review` HTTP routes are entry edges outside `modules/`: parse and validate input, call public module functions, shape the output. Routes, workers and processes never import a module's `store/`, `clients/` or `domain/` directly.
- `tool` Every runnable script has a named command in the task runner. _(entry-scripts check)_

## Writing Code

- `review` Tunables (thresholds, timeouts, batch sizes, caps) are named constants at top of file (`MAX_ATTEMPTS`, `RETRY_DELAY_MS`). Promote one to config/DB settings, with a code default as fallback, only when it must change without a deploy. The on/off gate from the Design section is not a tunable; that rule covers it.
- `tool`+`review` Treat external data as untrusted: validate and narrow it at the boundary. _(strict types force narrowing)_

### Naming and Comments

- `review` Comments carry what code can't: interface contracts, intent, and *why*. If a comment explains *what*, improve the names instead.
- `review` No comments on obvious code.
- `review` Include evidence and date when a choice came from a live observation (`Confirmed live 2026-09-24: ...`).
- `review` Cross-reference sibling code that follows the same rule instead of re-explaining (`same rule as the nightly backfill`).

*Examples:* `~/.claude/standards/comments.md`

## Refactoring

- `review` Refactor in small, behavior-preserving steps with tests green between each. Separate refactoring commits from behavior changes.
- `hint` Code smells (duplication, long parameter lists, feature envy, shotgun surgery) trigger refactoring; fix when touching the code, not in big-bang rewrites. _(jscpd, complexity, max-params)_
- `review` Make it work, then make it right. No opportunistic refactoring mid-feature: note smells, fix them after the feature is green as separate commits in the same PR, limited to files the change touched; ticket the rest. Exception: a refactor the feature needs goes first. `/spike-and-rebuild` applies this at feature scale. Don't delete unrelated dead code; do remove what your own change orphaned.

*Examples:* `~/.claude/standards/refactoring.md`

### Rename Safety

- `process` Search separately for every kind of reference (types, strings, dynamic lookups, re-exports, config, tests); one grep always misses something. Checklist in `refactoring.md`.

## Language Guidelines

Read the matching file before writing code in that language:

- TypeScript: `~/.claude/languages/typescript.md`
- Go: `~/.claude/languages/go.md`

## Testing

- `tool` Every source file in a module has a test file. _(untested-modules ratchet)_
- `process` TDD by default: red, green, refactor. A bug fix starts with a test that reproduces the bug and fails before the fix, for the reason the bug gives (see Examples).
- `process` A feature built through `/spike-and-rebuild` gets contract tests first, written by a fresh-context agent that sees only the committed stubs, their doc comments, and the plan's data structures and invariants, never the implementation. They sit beside the module as `foo.contract.test.ts` and start red because the stubs throw. The implementer's own red-green-refactor tests go in `foo.test.ts`. Bug fixes and small changes keep plain TDD by one agent.
- `tool` Contract tests are only added in a PR, never changed or deleted; a wrong one goes back to its author with the reason and the contract comment gains the missing sentence. _(`repo-checks contracts-unmodified`)_
- `tool` A PR adds no skipped or isolated test (`.skip(`, `.only(`, `xit(`, `xdescribe(`) in a test file; `it.todo` is fine. Fix or delete the test. _(`repo-checks skip-only`, `agentConfig.skipPatterns`)_
- `review` A public function's contract lives in its doc comment: behavior, boundaries, and the input shape of loosely typed parameters (`unknown`, `Record<string, unknown>`). The contract author has nothing else to go on.
- `hint` Mutation report on changed files under `agentConfig.mutationPaths` (the pure core): a surviving mutant is a change no test notices. Report only; equivalent mutants make 100% the wrong target. _(CI `mutation` job; becomes `tool` once a floor is calibrated)_
- `tool` Unit tests sit next to their module (`foo.test.ts`, `foo.contract.test.ts`); integration and e2e tests (real DB, several modules, full flows) live in `tests/integration/` and `tests/e2e/`. _(test-placement script)_
- `tool`+`review` Dependencies are params (Design: inject only I/O), with no hidden singletons, and each injected interface is minimal (a db client is one `query` method) so tests fake it in a few lines. _(ban top-level clients/pools in domain code)_
- `tool` Real sleeps go through an injectable delay; tests pass a no-op. _(ban setTimeout outside the delay util)_
- `review` Test names are full sentences describing behavior: `'loadSettings falls back to defaults for a key missing from the table'`.
- `review` Assert on query shape and params where the query itself is the contract.
- `tool` Integration and e2e tests use a disposable database from a test-only env var, never the app's. _(`repo-checks test-db-env`)_

*Examples:* `~/.claude/standards/testing.md`

## Debugging

- `process` Diagnose with real data before deciding. For fuzzy classification, prefer a per-item model pass over brittle heuristics.
- `process` When stuck after 3 attempts: stop, write down what failed, ask.

## Version Control

- `tool` Commit subjects are imperative, lowercase, concise, no trailing period (`add search page`). _(commit-msg hook, CI)_
- `tool`+`review` One logical change per commit. Feature branches merge with `merge <branch>`. _(merge format is tool)_
- `tool` A PR changes at most `maxDiffLines` (default 800) outside lockfiles, generated paths and moved blocks; larger work becomes stacked PRs. _(`repo-checks diff-size`; label `large-diff-approved` waives it)_
- `tool` Never commit a broken build or failing tests; never `--no-verify`; never force-push `main`. _(CI, guard hook)_
- `tool` No AI attribution in commits or PR descriptions. _(commit-message check)_
- `tool` Never hand-edit generated files (lockfiles, generated clients, `DO NOT EDIT` / `@generated`); change the source and rerun the generator. _(guard hook, generator + `git diff --exit-code`)_

## Resilience

- `review` External calls retry with bounded attempts and delay, then degrade (halve the batch, skip the item) instead of crashing the run.
- `review` Distinguish fatal (e.g. quota exhausted) from transient errors. Fatal unwinds, transient retries.
- `review` Log every skip or degradation with id and reason. Never lose data silently: unprocessed items stay candidates for the next run.

*Examples:* `~/.claude/standards/resilience.md`

## External Services

- `review` Be a polite, low-volume client. Pace requests against rate-sensitive targets: no rapid ad-hoc probing, batch checks into one run.
- `review` Respect each service's ToS and robots.txt. Don't collect from sources that forbid it.
- `review` $0 budget default: prefer free tiers, self-hosting, and round-robin keys over paid services.

## Data

- `review` Derive at query time instead of storing (ratios, totals, ages). Store raw inputs.
- `review` Feature-specific data goes in side tables (1:1, cascade delete) rather than widening core tables.

*Examples:* `~/.claude/standards/data.md`

## Security

- `tool` No secrets in the repo: env vars or a secret store, `.env*` gitignored, an `.env.example` committed. _(secret scan, audit)_
- `tool` Agents never read secret files (`.env*`, keys, cloud credentials), delete recursively outside the workspace, run `DROP`/`TRUNCATE`, or apply migrations outside a test database; a human applies migrations elsewhere. _(guard hook)_
- `tool`+`review` Never log secrets, tokens, or personal data; redact at the logger. _(`noConsoleFiles`)_
- `tool`+`review` Parameterized queries and argument arrays only; never interpolate input into SQL or shell commands. _(`parameterizedSqlFiles`; whether a fragment is constant is review)_
- `tool`+`review` Least privilege: scoped, read-only tokens where possible. _(`workflow-permissions` bans `write-all`)_

*Examples:* `~/.claude/standards/security.md`
