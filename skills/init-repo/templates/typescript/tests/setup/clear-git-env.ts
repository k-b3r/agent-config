// Git exports GIT_DIR, GIT_INDEX_FILE and friends to its hooks. The pre-push hook runs
// `pnpm check`, so any test that runs `git -C <temp repo> ...` would act on the repository
// being pushed instead of the temp one (seen: core.bare=true, a test identity in the local
// config, a stray commit and an extra branch). Tests never touch the repo they run in:
// clear the variables before any test runs. Wired as `setupFiles` in both vitest configs;
// `repo-checks git-test-env` fails a repo whose tests call git without it.
for (const name of [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_PREFIX',
  'GIT_NAMESPACE',
]) {
  delete process.env[name]
}
