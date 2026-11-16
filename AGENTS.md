# Global Instructions

Source of truth for Claude Code and pi. `install.sh` links this file to `~/.claude/CLAUDE.md` and `~/.pi/agent/AGENTS.md`. pi does not expand `@` imports; Claude Code does.

## Style
- Extremely concise in all responses and commit messages. Sacrifice grammar for concision.
- Only explain reasoning when it adds real value — skip narration for obvious/mechanical steps.
- At the end of each plan, list unresolved questions as terse bullet points.
- Never use em dashes (—). Use commas, colons, periods, or parentheses instead.

## Behavior
- Never use --dangerously-skip-permissions.

## Sub-agents
- Extension: `pi-herdr-subagents`. Pass `model` on every `subagent` call (full `provider/id`); never ask the user.
- sonnet `anthropic/claude-sonnet-5-5`: judgment work (design, planning, review, debugging, non-trivial implementation).
- deepseek-flash `opencode-go/deepseek-v4.1-flash`: mechanical or well-specified work (recon, scripts, bulk edits, simple fixes, big scans, parallel scouts). Never use haiku: it eats the Anthropic session limit, and on contained coding tasks deepseek-flash matched or beat it in Oct 2026 benchmarks. Review its output on bigger tasks for stubbed-out parts.
- Before every spawn, pick the model from the task itself, cheapest that fits. Sonnet is not a default: use it only where a wrong result would be subtle (design, security logic, judgment on unreliable signals). A task with exact changes written out goes to deepseek-flash. Large cross-module work that must connect several existing systems goes to sonnet: cheap models stubbed the hard part in one test. Cost counts; the user limits Anthropic spend.
- Starting points: scout deepseek-flash; planner and reviewer sonnet; worker by the rule above.

## Sub-agent pane layout (herdr)
- Wanted layout: the orchestrator (main session) keeps the left half of the screen; sub-agent panes tile in the right half (one stacked, then a 2x2 grid, and so on).
- Parallel spawns are safe since `pi-herdr-subagents` f25057e ("place subagent panes from the live layout, under a lock"): placement now reads the live layout and takes a lock, so several `subagent` calls in one turn no longer collapse into a row of strips.
- Check a layout with `herdr pane layout --pane $HERDR_PANE_ID`; after a spawn the main pane should be about half the width. If a batch still produces narrow strips, spawn one at a time again and report it on the package.

## Closing sub-agent panes
- After an idle-sub-agent check, once I have the data I need from it (its final report, PR URL, results), close its pane (`herdr pane close <pane-id>`). Keep an interactive pane open only while the user is still talking to it.

## Coding standards
@CODING_STANDARDS.md

## LabX Linear
- When the cwd is a `labx*` / `lx-*` repo (under `~/Develop/odi/`) and you need a Linear ticket (`CRM-*`, `LX360-*`), read the `labx-linear` skill first. pi's Linear MCP cannot see the LabX workspace; fetch through Claude Code in a Herdr pane.

## Git identity for personal projects
- Personal projects use ONLY GitHub account `k-b3r`, git author name `k-b3r`, email `dev.kimbermudez@gmail.com`. Never `kimbermudez` as a name, and no other account or email. Applies to steward instances (`GIT_USER_NAME`), clones, commits and PRs.

## Git identity for LabX work (`labx*` / `lx-*` repos under `~/Develop/odi/`)
- Use ONLY GitHub account `kimbermudez` for every `gh` and git action in these repos. It is the only account for labx* directories. Commit identity: `kimbermudez <kbermudez@labxchange360.com>`. The repo-local git identity is often the placeholder `t <t@t>`: pass `-c user.name=kimbermudez -c user.email=kbermudez@labxchange360.com` on commits.
- The `gh` active account can flip to `k-b3r` between sessions, and then org repo calls fail with "Could not resolve to a Repository". Before any `gh` call, check `gh auth status`; if `k-b3r` is active, run `gh auth switch --user kimbermudez` (or use `GH_TOKEN=$(gh auth token --user kimbermudez)` per command). Tell sub-agents the same.

## Repo visibility (personal projects)
- Create new personal repos as PUBLIC (GitHub Actions on standard runners is free there; private repos draw from a $12/month allowance and CI is blocked when it runs out). Never put secrets, tokens, or private data in them; check before the first push. Scratch and probe repos too, unless they hold something sensitive.

## Tools
@TOOLS.md
