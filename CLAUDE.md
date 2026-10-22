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
- Before every spawn, pick the model from the task itself, cheapest that fits. Sonnet is not a default: use it only where a wrong result would be subtle (design, security logic, judgment on unreliable signals). A task with exact changes written out goes to haiku or deepseek-flash. Cost counts; the user limits Anthropic spend.
- Starting points: scout haiku (deepseek-flash for large sweeps); planner and reviewer sonnet; worker by the rule above.

## Coding standards
@CODING_STANDARDS.md

## Tools
@TOOLS.md
