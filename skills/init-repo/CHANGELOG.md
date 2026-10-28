# init-repo template changelog

One entry per change to `templates/typescript/`, newest first, listing what changed, the file to edit in a repo, and the commit in agent-config.
A repo wired by an earlier `/init-repo` never sees a later template change: the skill copies only files the repo lacks and merges the missing pieces into existing ones (step 4). Read this file when retrofitting a repo that is already wired.
Shared configs come in through the lockfile, so run `pnpm update @k-b3r/agent-config` to pick them up.
The PR that changes a template adds its entry here.

## 2026-10-28 (c30a6da) which reviewer a PR gets

- `package.json` `agentConfig`: set `claudeReviewPaths` to the files the dear reviewer gets (decisions and writes), e.g. `["src/modules/*/domain/**", "src/modules/*/store.ts"]`, and `migrationPaths` if migrations live somewhere other than `**/migrations/**` or `**/*.sql`. Optional: those are the defaults. `pnpm exec repo-checks review-tier origin/main` prints `claude` or `deepseek` for the current branch and says why; a glob list that matches no tracked file warns. Run `pnpm update @k-b3r/agent-config` for the command. Nothing calls it yet: `pr-review.yml` wires it in the follow-up.
## 2026-10-21 (f66572d) local-only files stay out of the format check

- `.prettierignore`: add `SESSION_RESUME.md`, `TODOS.md` and `TRACKER_OUTBOX.md`; they live in `.git/info/exclude`, which prettier does not read, so `prettier --check .` failed the pre-push hook in a repo that had one.

## 2026-10-15 (aa24aa7) report mutation coverage on changed pure code

- `package.json`: add the `test:mutation` script (`stryker run`), the `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` devDependencies, and `agentConfig.mutationPaths` (the same globs as ESLint `pureCorePaths`, e.g. `["src/modules/*/domain/**"]`).
- Add `stryker.config.json` from the template.
- `.gitignore` and `.prettierignore`: add `.stryker-tmp/` and `reports/`.
- `vitest.config.ts`: add `.stryker-tmp/**` to `test.exclude`.
- `.github/workflows/ci.yml`: add `mutation` to `with.jobs`.

## 2026-10-15 (855e889) pull request template

- Add `.github/pull_request_template.md` from the template; `repo-checks audit` fails without one.

## 2026-10-15 (5854a38) pureCorePaths bans clock, randomness, fetch and process

- `eslint.config.js`: uncomment `pureCorePaths` once the fit check has modules, pointed at the pure code (`['src/modules/*/domain/**']` is the default layout; a repo laid out differently lists its files and records that in its `CODING_STANDARDS.md`).

## 2026-10-06 (b5db872) generated paths keep approval on upkeep regen pushes

- `.github/workflows/pr-review.yml`: add `with: generated-paths: '<same paths as pr-upkeep.yml regenerate-paths>'` (empty for a repo with no generated files).

## 2026-10-05 (7bd3142) commit-msg hook

- `lefthook.yml`: add the `commit-msg` job running `pnpm exec repo-checks commit-msg {1}`; `repo-checks audit` fails without it.

Comment-only edits, nothing for a repo to change: b89780c and 6ef39ef (eslint.config.js wording), 342a42a (`.dependency-cruiser.cjs`: add the commented `moduleTiers` once the repo has two or more modules).
