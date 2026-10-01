---
name: tech-sync
description: Fetches latest version, breaking changes, and best practices for a single technology from the web. Saves result locally to .claude/tech-sync/<tech>.md in the current project. Use when user runs "/tech-sync <name>" or before using any library/framework to ensure knowledge is current.
---

# tech-sync

## Usage

```
/tech-sync <tech-name>
```

Examples:
```
/tech-sync next.js
/tech-sync @anthropic-ai/sdk
/tech-sync tailwindcss
```

## Workflow

1. Check if `.claude/tech-sync/<tech>.md` exists — if fresh (under 7 days), use cached
2. Search web for: latest stable version, changelog, breaking changes, migration notes
3. Write result to `.claude/tech-sync/<tech>.md`
4. Print summary to user

## Output location

`.claude/tech-sync/<tech>.md` — local to current project, ignored by other projects.

See [REFERENCE.md](REFERENCE.md) for search strategy and file format.
