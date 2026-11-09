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
- sonnet `anthropic/claude-sonnet-5-5`: judgment work (design, planning, review, debugging, non-trivial implementation).
- deepseek-flash `opencode-go/deepseek-v4.1-flash`: mechanical or well-specified work (recon, scripts, bulk edits, simple fixes, big scans, parallel scouts). Never use haiku: it eats the Anthropic session limit, and on contained coding tasks deepseek-flash matched or beat it in Oct 2026 benchmarks. Review its output on bigger tasks for stubbed-out parts.
- Before every spawn, pick the model from the task itself, cheapest that fits. Sonnet is not a default: use it only where a wrong result would be subtle (design, security logic, judgment on unreliable signals). A task with exact changes written out goes to deepseek-flash. Large cross-module work that must connect several existing systems goes to sonnet: cheap models stubbed the hard part in one test. Cost counts; the user limits Anthropic spend.
- Starting points: scout deepseek-flash; planner and reviewer sonnet; worker by the rule above.

## Coding standards
@CODING_STANDARDS.md

## Tools
@TOOLS.md
