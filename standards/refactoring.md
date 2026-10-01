# Refactoring: examples

Rules live in `CODING_STANDARDS.md` → Refactoring.

## Small, behavior-preserving steps

Moving logic out of a worker into a domain module, tests green after each step:
```
1. Extract the decision into a function in the same file      tests green, commit
2. Move that function to the domain module, re-export          tests green, commit
3. Point the worker at the domain import, delete the re-export tests green, commit
4. Now change behavior, test-first                             separate commit
```

## Separate refactoring commits from behavior changes

```
refactor price parsing into domains/pricing      # no behavior change, reviewable as a move
treat "negotiable" as no price instead of 0      # behavior change, has its own test
```

## Smell → refactoring

| Smell | Looks like | Refactor |
|---|---|---|
| Duplication | same parsing in two workers | extract one shared function |
| Long parameter list | `f(db, log, delay, llm, opts, retries)` | group into a deps object |
| Feature envy | function mostly reads another module's data | move it into that module |
| Shotgun surgery | one change touches six files | pull the scattered decision into one module |

Fix smells in code you're already touching. Don't start a rewrite to fix them.

## Rename safety checklist

Search separately for each; one grep always misses something:
- direct references
- type-level references
- string literals (SQL, log messages, config keys, route names)
- dynamic imports and lookups by name
- re-exports and barrel files
- config files and scripts (`package.json`, CI workflows)
- tests and fixtures
