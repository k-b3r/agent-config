---
name: init-context
description: Trims what loads into Claude Code sessions for the current project by turning off irrelevant plugins, claude.ai connectors, and skills in .claude/settings.local.json. Use when user runs /init-context, starts setting up a repo, or asks to reduce context, startup tokens, or unused plugins/skills/connectors.
---

# init-context

Turn off what this project won't use so every session and subagent starts with less context. Writes only `.claude/settings.local.json` (personal, per project) and a decision log.

## Workflow

1. **Inventory.** Run `python3 ~/.claude/skills/init-context/scripts/inventory.py`. Also note from your own session context: which `mcp__claude_ai_*` connectors are loaded and which `anthropic-skills:*` synced skills are listed (no file lists these).
2. **Classify** each plugin, personal skill, connectors, synced skills:
   - **off**: clearly irrelevant to the project signals (e.g. Shopify skills in a scraper, frontend skills in a pure CLI)
   - **keep**: clearly relevant, or a general process skill (TDD, debugging, planning)
   - **ask**: plausible but unknown (Linear/Notion issue tracking, Gmail, doc tools, dataviz)
3. **Ask** only the `ask` items, in one batch (AskUserQuestion, multiSelect where it fits). Example: "Will you track this repo's issues in Linear soon?" Don't ask about clear cases.
4. **Show the plan** as a table: item, action, reason, ~tokens saved. Get a yes before writing.
5. **Apply** with `python3 ~/.claude/skills/init-context/scripts/apply.py '<patch json>'`. It merges, keeps existing keys, prints a diff.
6. **Log** decisions to `.claude/context-profile.md` (create or update): date, each item turned off and why, how to undo. JSON can't hold comments; this is the record.
7. **Tell the user:** takes effect next session. To verify, run `/context` in a new session and compare.

## Levers (exact keys)

| Target | Key | Notes |
|---|---|---|
| Whole plugin | `"enabledPlugins": {"<id>": false}` | Only way to drop plugin skills; ids from inventory |
| Personal skill | `"skillOverrides": {"<name>": "<state>"}` | `off` (hidden, not invocable), `user-invocable-only` (hidden from Claude, `/name` still works), `name-only`, `on` |
| All claude.ai connectors | `"disableClaudeAiConnectors": true` | All-or-nothing; no per-connector key |
| Synced claude.ai skills | `"syncClaudeAiSkills": false` | All-or-nothing locally; per-skill only on claude.ai |

Prefer `user-invocable-only` over `off` for personal skills that are merely unlikely: zero listing cost, still runnable.

## Rules

- Never edit `~/.claude/settings.json` or shared `.claude/settings.json`; local file only.
- Never turn off this skill itself or the user's process skills without asking.
- If a connector is needed even occasionally, keep connectors on: the switch is global.
- Re-run when the project changes shape (e.g. a UI is added to a CLI repo).

## Example patch

```json
{
  "enabledPlugins": {"shopify-ai-toolkit@claude-plugins-official": false},
  "disableClaudeAiConnectors": true,
  "syncClaudeAiSkills": false,
  "skillOverrides": {"visualize": "user-invocable-only"}
}
```
