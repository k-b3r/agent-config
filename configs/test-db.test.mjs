import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertTestDatabase, testDatabaseUrl } from './test-db.mjs'

const REFUSED = /refusing|does not contain/i

test('testDatabaseUrl returns a URL whose database name contains test', () => {
  assert.equal(testDatabaseUrl({ TEST_DATABASE_URL: 'postgres://u:p@localhost:5432/app_test' }), 'postgres://u:p@localhost:5432/app_test')
  assert.equal(testDatabaseUrl({ TEST_DATABASE_URL: 'postgresql://localhost/test' }), 'postgresql://localhost/test')
  assert.equal(testDatabaseUrl({ TEST_DATABASE_URL: 'postgres://u:p@h/Test_DB?sslmode=disable' }), 'postgres://u:p@h/Test_DB?sslmode=disable')
})

test('testDatabaseUrl refuses a database whose name lacks test, and the message hides the password', () => {
  assert.throws(() => testDatabaseUrl({ TEST_DATABASE_URL: 'postgres://u:hunter2@prod.example.com:5432/app' }), (error) => {
    assert.match(error.message, REFUSED)
    assert.match(error.message, /"app"/)
    assert.doesNotMatch(error.message, /hunter2/)
    return true
  })
})

test('a test word in the user or host does not make a non-test database pass', () => {
  assert.throws(() => testDatabaseUrl({ TEST_DATABASE_URL: 'postgres://test:test@test.example.com/app' }), REFUSED)
})

test('testDatabaseUrl refuses a missing, empty, unparseable or database-less URL', () => {
  assert.throws(() => testDatabaseUrl({}), /TEST_DATABASE_URL is not set/)
  assert.throws(() => testDatabaseUrl({ TEST_DATABASE_URL: '' }), /TEST_DATABASE_URL is not set/)
  assert.throws(() => testDatabaseUrl({ TEST_DATABASE_URL: 'not a url' }), /not a valid URL/)
  assert.throws(() => testDatabaseUrl({ TEST_DATABASE_URL: 'postgres://u:p@localhost:5432' }), REFUSED)
  assert.throws(() => testDatabaseUrl({ TEST_DATABASE_URL: 'postgres://u:p@localhost:5432/' }), REFUSED)
})

test('testDatabaseUrl never reads the app DATABASE_URL', () => {
  assert.throws(() => testDatabaseUrl({ DATABASE_URL: 'postgres://u:p@localhost/app_test' }), /TEST_DATABASE_URL is not set/)
})

test('assertTestDatabase checks any URL, for a repo that keeps its own variable name', () => {
  assert.doesNotThrow(() => assertTestDatabase('postgres://u:p@localhost/shop_test'))
  assert.throws(() => assertTestDatabase('postgres://u:p@localhost/shop'), REFUSED)
})
