# Global Instructions

## Style
- Extremely concise in all responses and commit messages. Sacrifice grammar for concision.
- Only explain reasoning when it adds real value — skip narration for obvious/mechanical steps.
- At the end of each plan, list unresolved questions as terse bullet points.
- Never use em dashes (—). Use commas, colons, periods, or parentheses instead.

## Behavior
- Never use --dangerously-skip-permissions.

## Sub-agents
- Extension: `pi-herdr-subagents`. Pass `model` on every `subagent` call (full `provider/id`); never ask the user.
- haiku `anthropic/claude-haiku-5-5`: mechanical or well-specified work (recon, scripts, bulk edits, simple fixes).
- sonnet `anthropic/claude-sonnet-5-5`: judgment work (design, planning, review, debugging, non-trivial implementation).
- deepseek-flash `opencode-go/deepseek-v4.1-flash`: bulk or mechanical work to keep off the Anthropic limit (big scans, parallel scouts).
- Defaults: scout haiku (deepseek-flash for large sweeps); planner, reviewer, worker sonnet.

## Coding standards
@CODING_STANDARDS.md

## Tools
@TOOLS.md
