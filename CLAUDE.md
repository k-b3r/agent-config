# Global Instructions

## Style
- Extremely concise in all responses and commit messages. Sacrifice grammar for concision.
- Only explain reasoning when it adds real value — skip narration for obvious/mechanical steps.
- At the end of each plan, list unresolved questions as terse bullet points.
- Never use em dashes (—). Use commas, colons, periods, or parentheses instead.

## Behavior
- When stuck after 3 attempts: stop, document what failed, ask.
- Never use --no-verify, --dangerously-skip-permissions, or force-push to main.
- Never commit broken builds.
- Never manually edit CHANGELOG.md files or any file marked as auto-generated (e.g. "DO NOT EDIT", "@generated", generated lockfiles/clients). Change the source or rerun the generator instead.

## Commits
- Imperative, lowercase, concise. No period.
- NEVER add the agent's name as co-author or attribution: no `Co-Authored-By: Claude` trailer in commits, no "Generated with Claude Code" line in PR descriptions.
- Examples: `fix auth token expiry`, `add disclosure cache`, `refactor scraper split`

## Coding standards
@CODING_STANDARDS.md
