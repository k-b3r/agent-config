# tech-sync Reference

## Search strategy

For each technology, run these searches in order:

1. `"<tech> latest version 2026"`
2. `"<tech> changelog"`
3. `"<tech> breaking changes migration"`
4. `"<tech> release notes site:github.com"`

Prefer: official docs, GitHub releases page, official blog. Skip: StackOverflow, random blogs.

## Output file format

Save to `.claude/tech-sync/<tech-slug>.md`:

```markdown
---
tech: <name>
version: <x.y.z>
fetched: <YYYY-MM-DD>
source: <url>
---

# <Tech Name> — <x.y.z>

## Released
<date>

## Key changes
- <change>
- <change>

## Breaking changes
- <what broke> → <how to fix>

## Install
\`\`\`
npm install <package>@<version>
\`\`\`

## Notes
<anything project-relevant: peer deps, config changes, gotchas>
```

## Cache rule

If `.claude/tech-sync/<tech>.md` exists and `fetched` date is within 7 days — skip web search, read from file instead.

## Slug naming

| Input | Filename |
|---|---|
| next.js | nextjs.md |
| @anthropic-ai/sdk | anthropic-sdk.md |
| tailwindcss | tailwindcss.md |
| react | react.md |
