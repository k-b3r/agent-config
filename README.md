# agent-config

Personal agent setup (pi is the primary harness; the `~/.claude` links stay for Claude Code): global instructions, general coding standards, own skills. CLI tools and Pi/Claude extensions live in the companion `terminal-config` repo.

```
AGENTS.md            -> ~/.claude/CLAUDE.md and ~/.pi/agent/AGENTS.md (global instructions; imports CODING_STANDARDS.md, TOOLS.md)
CLAUDE.md            -> this repo only: imports AGENTS.md
CODING_STANDARDS.md  -> ~/.claude/CODING_STANDARDS.md (language-agnostic)
TOOLS.md             -> ~/.claude/TOOLS.md (imported by AGENTS.md: when to use each tool)
languages/           -> ~/.claude/languages (read on demand per language)
standards/           -> ~/.claude/standards (do/don't examples per section, read on demand)
skills/<name>/       -> ~/.claude/skills/<name> and ~/.pi/agent/skills/<name>
hooks/guard.mjs      -> ~/.claude/hooks/agent-config-guard.mjs (PreToolUse; install.sh adds it to settings.json)
pi/extensions/*.js   -> ~/.pi/agent/extensions/ (agent-guard.js: the same rules on pi's tool_call, AGENT_GUARD=off disables; standards-loader.js: adds CODING_STANDARDS.md and TOOLS.md to every run inside a git repo, PI_STANDARDS=off disables)
configs/             -> shared lint/boundary configs, installed into each repo as a git dependency
scripts/             -> the bins in package.json (repo-checks, pr-automation, ...); pi-sync.mjs -> ~/.local/bin/pi-sync
docs/                -> reference: shared configs, agent review, CI workflows, pi-sync
```

## Companion repo

CLI tools (CodeGraph, diagram-design) and the pi extensions for the terminal (`bash-compact`, `claude-usage`, the Herdr state) live in the private `k-b3r/terminal-config` repo; run its `install.sh` on every device. This repo keeps the usage guidance in `TOOLS.md` and the skills that call those tools, so agent behavior does not change. The rule for where a pi extension lives: if it shapes what the agent does (the guard, the standards loader), it is agent behavior and lives here, next to the rules it enforces; terminal and display extensions live in `terminal-config`.

## Install

```bash
git clone git@github.com:k-b3r/agent-config.git ~/Develop/agent-config
~/Develop/agent-config/install.sh
```

Symlinks config, adds the guard hook to `~/.claude/settings.json` (blocks pushes to main, `--no-verify`, AI attribution in commits/PRs, edits to lockfiles and `@generated` files, before CI would catch them; also reads of secret files (`.env*`, keys, cloud credentials), recursive deletes outside the workspace, and destructive SQL or applied migrations unless the target is a test database; limits in the header of `hooks/guard.mjs`). Existing non-linked files are moved to `~/.claude/backup-<timestamp>/`. Rerun after adding, renaming or deleting a skill (a link to one that is gone is removed). CLI tools and Pi/Claude extensions are installed by `terminal-config`.

## Shared configs

`tool` rules need a check in each repo. `configs/` holds the shared part so repos reference it instead of copying (copies drift):

```bash
pnpm add -D github:k-b3r/agent-config   # lockfile pins the commit; `pnpm update @k-b3r/agent-config` pulls changes
```

```js
// eslint.config.js
import { baseConfig } from '@k-b3r/agent-config/eslint'
export default [...baseConfig({ tsconfigRootDir: import.meta.dirname, entryPoints: ['src/workers/*/index.ts'], delayModules: ['src/platform/delay.ts'] }), /* repo blocks */]

// .dependency-cruiser.cjs
const { baseRules, baseOptions } = require('@k-b3r/agent-config/dependency-cruiser')
module.exports = { forbidden: [...baseRules({ publicApis: ['src/modules/catalog'], heavyDeps: [{ packages: ['playwright'], owner: 'src/modules/collection/browser.ts' }], inner: ['src/modules'], entryPoints: ['src/workers'] })], options: baseOptions() }
```

Each config's options are documented in its file. What the boundary rules, the opt-in lint rules, `repo-checks` (the `tool` rules no linter fits) and the `test-db` helper cover: [docs/shared-configs.md](docs/shared-configs.md).

## Review and CI

- [docs/review.md](docs/review.md): which reviewer a PR gets (`repo-checks review-tier`), the `review-seeds` regression suite for the review prompt, and why this repo's own PRs get no agent review.
- [docs/ci.md](docs/ci.md): the reusable workflows (`ci-typescript`, `pr-review`, `auto-merge`, `pr-upkeep`), the confidence label, the report scripts, and action pinning.

## Editing

`~/.claude` links into this checkout's working tree, so whatever branch it has checked out is live in every session. Keep that checkout (`$AGENT_CONFIG`, wherever you cloned it) on `main` and pull after each merge. Make changes in a sibling worktree, one per branch:

```bash
git -C "$AGENT_CONFIG" worktree add ../agent-config-<branch> -b <branch> main
```

Remove it once the PR merges: `git -C "$AGENT_CONFIG" worktree remove ../agent-config-<branch>`. A new skill or rule goes live only after its PR merges (rerun `install.sh` for a new skill).

`pnpm check` is this repo's canonical check: eslint on its own scripts, hooks and pi extensions (`eslint.config.mjs`), the tests, and the seed validation and coverage. CI runs it, plus shellcheck on the shell scripts and actionlint on the workflows.

## Scope

- Here: rules that apply to every project, skills written by me.
- Not here: CLI tool installation and Pi/Claude extensions (`terminal-config`), third-party skills (install via their own tooling), project-specific rules (live in each repo's `CODING_STANDARDS.md` / `CLAUDE.md`).
- Add a skill once a workflow has repeated 3+ times or the agent needed the same correction twice.
- Skill descriptions may say what the skill does as well as when to use it. Tested 2026-10-06 against superpowers' "triggers only, never summarize the workflow" rule: 12 headless runs (Opus 5.5, direct and indirect prompts) of a skill whose description contradicted its body; every run loaded the body and followed it, with either description style.
- Add tool usage guidance to `TOOLS.md`; installation belongs in `terminal-config`. Per-project tools go in that repo's `.mcp.json`.
