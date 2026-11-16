// Guard for integration tests that reset the database (DROP SCHEMA, TRUNCATE, migrate).
// `repo-checks test-db-env` only checks that tests read the test-only variable; it cannot
// tell that the variable points at a test database. A reset against the wrong database
// deletes real data, so refuse any URL whose database name does not contain "test".
//
//   import { testDatabaseUrl } from '@k-b3r/agent-config/test-db'
//   const pool = createDbPool(testDatabaseUrl())            // reads TEST_DATABASE_URL
//   assertTestDatabase(process.env.MY_TEST_DB_URL)          // a repo with another variable name
//
// Only the database name counts: a `test` user or host (`postgres://test@prod-host/app`) does not pass.
// Errors name the host and database, never the password.

const ENV_NAME = 'TEST_DATABASE_URL'

/**
 * Throws unless `url` is a URL whose database name (the path) contains "test", any case.
 * Returns the URL, so it can wrap a value: `createDbPool(assertTestDatabase(url))`.
 * @param {string} url
 * @returns {string}
 */
export function assertTestDatabase(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Refusing to use the database: the value is not a valid URL (credentials not shown)')
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (!/test/i.test(database)) {
    throw new Error(
      `Refusing to run integration tests on database "${database}" at ${parsed.host || 'the default host'}: the database name does not contain "test". Point ${ENV_NAME} at a disposable test database.`,
    )
  }
  return url
}

/**
 * The URL in TEST_DATABASE_URL, checked by `assertTestDatabase`. Never reads the app's DATABASE_URL.
 * @param {Record<string, string | undefined>} [env] defaults to process.env
 * @returns {string}
 */
export function testDatabaseUrl(env = process.env) {
  const url = env[ENV_NAME]
  if (!url) throw new Error(`${ENV_NAME} is not set: integration tests need a disposable test database, never the app's`)
  return assertTestDatabase(url)
}
