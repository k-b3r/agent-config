# init-repo template changelog

One entry per change to `templates/typescript/`, newest first, listing what changed, the file to edit in a repo, and the commit in agent-config.
A repo wired by an earlier `/init-repo` never sees a later template change: the skill copies only files the repo lacks and merges the missing pieces into existing ones (step 4). Read this file when retrofitting a repo that is already wired.
Shared configs come in through the lockfile, so run `pnpm update @k-b3r/agent-config` to pick them up.
The PR that changes a template adds its entry here.

## 2026-10-28 (fa63541) tests that run git ignore the git variables of a hook

- Add `tests/setup/clear-git-env.ts` from the template: it deletes `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_PREFIX` and `GIT_NAMESPACE` from `process.env`.
- `vitest.config.ts` and `vitest.integration.config.ts`: add `setupFiles: ['./tests/setup/clear-git-env.ts']` to `test`.
- Why: from a linked worktree git runs the pre-push hook with `GIT_DIR` set, so a test running `git -C <temp repo> ...` changed the real repository. `repo-checks git-test-env` (part of `all`, so CI) fails a repo whose tests call git without this setup file, after `pnpm update @k-b3r/agent-config`.

## 2026-10-28 (35628d4) a fresh repo passes `pnpm check` and the integration job

- `vitest.config.ts` and `vitest.integration.config.ts`: add `passWithNoTests: true` to `test`. Without it the first `pnpm test` exits 1 ("No test files found"), and so does the integration job of a PR in a repo with no integration test yet.
- `package.json`: remove the `tsx` devDependency if nothing uses it; `knip` fails on it ("Unused devDependencies").
- `stryker.config.json`: reformat with `pnpm exec prettier --write stryker.config.json`; the old copy failed `prettier --check .` on day one.
- `knip.json`: `entry` becomes `["src/workers/*/index.ts", "tests/**/*.int.test.ts"]` (the vitest plugin already adds `src/**/*.test.ts`). `project` is unchanged. In a repo with no files yet knip still prints "no matches" hints; they are expected and go away once files exist.

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
