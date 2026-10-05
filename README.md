# agent-config

Personal Claude Code setup: global instructions, general coding standards, own skills.

```
CLAUDE.md            -> ~/.claude/CLAUDE.md (imports CODING_STANDARDS.md)
CODING_STANDARDS.md  -> ~/.claude/CODING_STANDARDS.md (language-agnostic)
TOOLS.md             -> ~/.claude/TOOLS.md (imported by CLAUDE.md: when to use each tool)
tools/<name>.sh      -> sourced by install.sh: installs + wires one tool (pinned, idempotent)
languages/           -> ~/.claude/languages (read on demand per language)
standards/           -> ~/.claude/standards (do/don't examples per section, read on demand)
skills/<name>/       -> ~/.claude/skills/<name>
hooks/guard.mjs      -> ~/.claude/hooks/agent-config-guard.mjs (PreToolUse; install.sh adds it to settings.json)
configs/             -> shared lint/boundary configs, installed into each repo as a git dependency
```

## Install

```bash
git clone git@github.com:k-b3r/agent-config.git ~/Develop/agent-config
~/Develop/agent-config/install.sh
```

Symlinks config, adds the guard hook to `~/.claude/settings.json` (blocks pushes to main, `--no-verify`, AI attribution in commits/PRs, edits to lockfiles and `@generated` files, before CI would catch them), then installs each tool in `tools/` (pinned version, user-scope MCP, telemetry off). Existing non-linked files are moved to `~/.claude/backup-<timestamp>/`. Rerun after adding a skill or tool; `AGENT_CONFIG_SKIP_TOOLS=1` links only.

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

Each config's options are documented in its file. `repo-checks` (bin) covers the `tool` rules no linter fits: commit subjects, escape-hatch and untested-module ratchets, test placement, entry scripts, test DB env, and `audit` (fails on any shared check the repo hasn't wired). Settings: `package.json` `"agentConfig"`; commands: header of `scripts/repo-checks.mjs`.

CI: `.github/workflows/ci-typescript.yml` is a reusable workflow running all of it (format, lint, depcruise, typecheck, knip, `repo-checks all`, gitleaks, unit/integration/e2e); caller examples in its header. `pr-review.yml` adds the agent review and gate (transcript kept as an artifact). `auto-merge.yml` merges PRs labelled `automerge` once green and current; `pr-upkeep.yml` regenerates generated files on PRs and merges main into PRs that fall behind (both push with a GitHub App token, setup in `/init-repo`). `ci-report` (bin) shows where a repo's Actions minutes go. `/init-repo` (skill) copies `skills/init-repo/templates/typescript/` into a new or existing repo and wires all of the above. `pnpm test` runs a violating fixture per rule plus a clean control.

## Editing

`~/.claude` links into this checkout's working tree, so whatever branch it has checked out is live in every session. Keep `~/Develop/agent-config` on `main` and pull after each merge. Make changes in a sibling worktree, one per branch:

```bash
git -C ~/Develop/agent-config worktree add ../agent-config-<branch> -b <branch> main
```

Remove it once the PR merges: `git -C ~/Develop/agent-config worktree remove ../agent-config-<branch>`. A new skill or rule goes live only after its PR merges (rerun `install.sh` for a new skill).

## Scope

- Here: rules that apply to every project, skills written by me.
- Not here: third-party skills (install via their own tooling so they keep updating; a `tools/<name>.sh` step may run that tooling), project-specific rules (live in each repo's `CODING_STANDARDS.md` / `CLAUDE.md`).
- Add a skill once a workflow has repeated 3+ times or the agent needed the same correction twice.
- Add a tool to `tools/` only if it should be on in every project; per-project tools go in that repo's `.mcp.json`.
