---
name: write-a-skill
description: Writes a new agent skill, or reworks one, and proves it changes agent behavior. Checks the skill is warranted, records what an agent gets wrong without it, writes a short SKILL.md (plus tested scripts for deterministic steps), then verifies with headless `claude -p` runs that the skill gets loaded and followed. Use when user runs /write-a-skill, asks to "make a skill", "turn this into a skill", "write a skill for X", or when a workflow has repeated enough to deserve one.
---

# Write a skill

A skill is worth its tokens only if an agent behaves differently with it. So: baseline first, write second, verify last.

Where it lives: your own skills in `~/Develop/agent-config/skills/<name>/` (symlinked into `~/.claude/skills` by `install.sh`); a repo-only skill in that repo's `.claude/skills/<name>/`. Changes go through a PR either way.

## 1. Is it warranted?

Write one only when a workflow has repeated 3+ times or the agent needed the same correction twice (agent-config README). Otherwise:
- A rule every session needs: a line in `CODING_STANDARDS.md` (always loaded, so keep it short).
- A rule only one repo needs: that repo's `CODING_STANDARDS.md` or `CLAUDE.md`.
- A one-off: nothing; just do it.

Check for overlap first: `ls ~/.claude/skills` and the session's skill list. Extend an existing skill before adding a sibling.

## 2. Baseline

Note what goes wrong without the skill: from the session that prompted it (the corrections, the repeated steps), or by running the task once in a scratch repo. Each failure becomes a line the skill must change. No failures found: the skill isn't needed.

## 3. Write

```
<name>/
  SKILL.md          required, under ~100 lines
  REFERENCE.md      only for detail most runs don't need (one level deep)
  scripts/          deterministic steps, each with a node:test file next to it
```

- **Frontmatter:** `name` (kebab-case, matches the folder) and `description`: what it does, then "Use when ..." with the phrases a user would actually say and `/name`. Third person, under 1024 chars. A description that also summarizes the steps is fine (tested 2026-10-06, agent-config README).
- **Body:** imperative steps, numbered when order matters. Each line answers a baseline failure; cut anything the agent already does right.
- **Don't restate** coding standards or repo rules; reference them (`per the repo's CODING_STANDARDS.md`). The repo file wins on conflict.
- **Gates:** say exactly where the skill stops for the user, and what it never does (merge, delete, add approval labels).
- **Scripts** for anything that would be regenerated each run or must be exact (API queries, parsing). Follow `skills/address-pr-review/scripts/` (exports for tests, `main` guarded by realpath).
- **Output:** end with a fixed report format when the result is read by a person or another agent.

## 4. Verify

Pick a **marker**: an effect only the skill's body causes (a heading name, a first line, a file, a command) and a shell check that sees it. Then run 3+ times with a direct prompt and an indirect one:

```bash
node ~/.claude/skills/write-a-skill/scripts/verify-skill.mjs <skill-dir> \
  --prompt "write release notes for v1.1" \
  --prompt "we're cutting 1.1, jot down what changed for the GitHub release" \
  --check "head -1 RELEASE_NOTES.md | grep -q 'rn-skill'" \
  --fixture <scratch repo with what the task needs> \
  --allow "Bash(git log:*),Write,Read"
```

It copies the skill in as `<name>-verify` (so an installed copy can't stand in) and prints `loaded n/N  check n/N` per prompt, then `PASS` or `FAIL`. Transcripts stay in the printed work dir.
- Not loaded: the description doesn't match how people ask. Add their phrasing and rerun.
- Loaded but check fails: read the transcript; the body is unclear or contradicts itself.
- Runs are real sessions: keep runs and prompts few. A skill that needs network, GitHub or a tracker can't run in a scratch repo; verify those on the next real use and say so.

## 5. Ship

- In agent-config: worktree per the README, one commit (`add <name> skill`), PR. If a `CODING_STANDARDS.md` line covers the workflow, link the skill from it.
- After merge: `git -C ~/Develop/agent-config pull`, then `AGENT_CONFIG_SKIP_TOOLS=1 ~/Develop/agent-config/install.sh`. A new skill loads in the next session.

## Report

```
write-a-skill: <name> (<n> lines + <scripts>)
Baseline: <failures it fixes>
Verify: direct 3/3 loaded, 3/3 check; indirect 3/3, 3/3
PR: <url>
```
