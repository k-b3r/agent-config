---
name: init-repo
description: Wires a TypeScript + pnpm repo to the k-b3r/agent-config standards from day one, or retrofits an existing one. Copies the templates (shared ESLint and dependency-cruiser configs, knip, lefthook, reusable CI, agent review), records the architecture fit check, sets up GitHub labels, and finishes only when `pnpm check` and `repo-checks audit` pass. Use when user runs /init-repo, starts a new project, or asks to bring a repo in line with the coding standards.
---

# init-repo

Every `tool` rule in CODING_STANDARDS.md counts as `review` until a repo wires its check. This skill wires them all, then proves it with `repo-checks audit`. Templates: `templates/typescript/` next to this file (TypeScript + pnpm only; for another stack, stop and say so).

## Workflow

1. **Survey.** New or existing repo? Read `package.json`, configs, `.github/workflows/`, `CODING_STANDARDS.md`, `CONTEXT.md`. Existing repo: run `pnpm exec repo-checks audit` if the dep is already there; otherwise list which template files already exist.
2. **Fit check.** Ask the 6 Architecture fit-check questions from CODING_STANDARDS.md (one AskUserQuestion batch; skip ones the code answers). The first yes picks the shape. Fill `CONTEXT.md` > Architecture with the date and each answer.
3. **Branch.** Work on a branch (`init-repo`), never `main`.
4. **Copy templates.** Copy every file from `templates/typescript/` that doesn't exist yet. Never overwrite: for an existing file, show the template beside it and merge only the missing pieces (scripts, devDependencies, `agentConfig`, `.gitignore` lines). Replace `REPO_NAME`.
5. **Fit the configs to the shape** picked in step 2:
   - `eslint.config.js`: `entryPoints` = composition roots (workers, server index, scripts), `delayModules` = the delay util, `defaultExportAllowed` = framework files (Next.js pages, ...).
   - `.dependency-cruiser.cjs`: `publicApis` = one folder per feature module, `heavyDeps` = each heavy package and its single owner file, `inner` / `entryPoints` folders.
   - `package.json` `agentConfig`: `sourceDirs`, `entries` (same as ESLint `entryPoints`), `appDbEnv`.
   - `knip.json` entries; `integration.yml` paths. Repo has a UI or HTTP flow: add an `e2e.yml` caller (`jobs: e2e`) and a Playwright config.
6. **Install.** `pnpm install`. Check `.git/hooks/pre-push` exists and `pnpm exec lefthook version` works: if `node_modules` is missing the hook prints "Can't find lefthook in PATH" and lets the push through unchecked.
7. **GitHub.** Create the review labels (idempotent):
   ```bash
   gh label create agent-changes-requested --color D93F0B --description "Agent review found blocking issues" --force
   gh label create needs-human --color FBCA04 --description "Agent wants a human decision before merge" --force
   gh label create human-approved --color 0E8A16 --description "Human reviewed a needs-human PR and signs off" --force
   gh label create automerge --color 1D76DB --description "Merge automatically once green and current" --force
   gh label create merge-conflict --color B60205 --description "Main couldn't be merged in automatically" --force
   ```
   The `CLAUDE_CODE_OAUTH_TOKEN` secret is the user's: ask them to run `! claude setup-token` and `! gh secret set CLAUDE_CODE_OAUTH_TOKEN`. Never handle the token yourself.
   `auto-merge.yml` / `pr-upkeep.yml` need the user's GitHub App (`k-b3r-ci`) installed on the repo, plus `! gh variable set CI_APP_ID` and `! gh secret set CI_APP_PRIVATE_KEY < key.pem`. Set `regenerate` / `regenerate-paths` in `pr-upkeep.yml` if the repo has generated files, and the same paths as `generated-paths` in `pr-review.yml` (so upkeep's regen commits keep `human-approved`); a different App name also goes in `pr-review.yml`'s `allowed-bots` (default `k-b3r-ci`) so its pushes still get reviewed; add `e2e` to `auto-merge.yml`'s workflow list if the repo has `e2e.yml`.
8. **Verify.** `pnpm check` and `pnpm exec repo-checks audit` must pass. Retrofit: fix new findings or ratchet them (escape hatches, untested modules); list what's left as tickets.
9. **PR.** Commit (`init repo wiring` or per piece on a retrofit), push, open the PR. Its CI and agent review are the live test: all jobs green, gate passes.

## Rules

- Copy, then fit: never leave template placeholders (`<answer>`, `REPO_NAME`, empty `publicApis` when the repo has modules).
- Shared configs stay referenced (`@k-b3r/agent-config`), never copied into the repo; repo-specific rules go in the repo's own blocks.
- Keep devDependency ranges from the template: newer majors can break the toolchain (TypeScript 7 broke typescript-eslint 8; confirmed 2026-10-04).
- Private repo on the free plan: GitHub can't require status checks. Say so; the pre-push hook and merging only on green are the guard.
