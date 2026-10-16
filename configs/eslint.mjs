// Shared ESLint base for TypeScript repos: the `tool` rules of CODING_STANDARDS.md
// and languages/typescript.md. A repo's eslint.config.js spreads it, then adds
// its own blocks (framework plugins, extra boundaries).
import js from '@eslint/js'
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { DEFAULT_SQL_FRAGMENT, noInterpolatedSql } from './no-interpolated-sql.mjs'

// Hints (warn only): smells that trigger a look, not a block.
const MAX_LINES = 400
const MAX_PARAMS = 4
const MAX_COMPLEXITY = 15

const TS_FILES = ['**/*.{ts,tsx,mts,cts}']
const TEST_FILES = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', 'tests/**']
// Tool configs (vitest, playwright, next, ...) need a default export.
const TOOL_CONFIG_FILES = ['*.config.{ts,mts,cts}', '**/*.config.{ts,mts,cts}']

const EXPORT_ALL = { selector: 'ExportAllDeclaration', message: 'List exports explicitly; never export *.' }
const DEFAULT_EXPORT = { selector: 'ExportDefaultDeclaration', message: 'Use named exports.' }
const INLINE_SLEEP = {
  selector:
    "NewExpression[callee.name='Promise'] > ArrowFunctionExpression > CallExpression[callee.name='setTimeout']",
  message: 'Inject a delay function so tests can pass a no-op; only the delay module sleeps.',
}
const AMBIENT_CLOCK = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'Pass `now` in: pure code never reads the clock.',
  },
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Pass `now` in: pure code never reads the clock.',
  },
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: 'Inject randomness (or an id) as an argument: pure code never draws its own.',
  },
]
const PURE_CORE_GLOBALS = ['fetch', 'process'].map((name) => ({
  name,
  message: 'Pure code has no network or process access: take the value as an argument, do the call in the shell.',
}))
const AMBIENT_ENV = {
  object: 'process',
  property: 'env',
  message: 'Take env values as a parameter; read process.env only in entry points.',
}

/**
 * @param {object} options
 * @param {string} options.tsconfigRootDir usually `import.meta.dirname`
 * @param {string[]} [options.allowDefaultProject] TS files outside every tsconfig (root scripts, configs)
 * @param {string[]} [options.entryPoints] composition roots that may read process.env (workers, server index, scripts)
 * @param {string[]} [options.delayModules] the injectable delay util, the only place allowed to sleep
 * @param {string[]} [options.defaultExportAllowed] framework files that must default-export (Next.js pages, Playwright global setup), tests included
 * @param {string[]} [options.parameterizedSqlFiles] domain code where `.query()` SQL takes values as $n parameters (opt-in; see no-interpolated-sql.mjs)
 * @param {string} [options.sqlFragment] regex naming the interpolations that are safe SQL fragments (constants, builders)
 * @param {string[]} [options.noConsoleFiles] domain code that logs through the injected Logger, never console.*
 * @param {string[]} [options.pureCorePaths] pure functional core (e.g. `src/modules/*\/domain/**`): no clock, randomness, `fetch` or `process`; callers pass those in
 * @param {string[]} [options.ignores]
 */
export function baseConfig({
  tsconfigRootDir,
  allowDefaultProject = [],
  entryPoints = [],
  delayModules = [],
  defaultExportAllowed = [],
  parameterizedSqlFiles = [],
  sqlFragment = DEFAULT_SQL_FRAGMENT,
  noConsoleFiles = [],
  pureCorePaths = [],
  ignores = [],
}) {
  // A later block's no-restricted-syntax replaces earlier options, so each
  // scope restates the full list it keeps.
  const syntax = (...rules) => ({ 'no-restricted-syntax': ['error', ...rules] })

  return tseslint.config(
    // .stryker-tmp holds full copies of the sources while a mutation run is in progress.
    { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.stryker-tmp/**', ...ignores] },
    js.configs.recommended,
    tseslint.configs.recommended,
    eslintComments.recommended,
    {
      files: TS_FILES,
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: { projectService: { allowDefaultProject }, tsconfigRootDir },
      },
      rules: {
        // Unawaited promises in long-running loops silently drop errors.
        '@typescript-eslint/no-floating-promises': 'error',
        // JSX handlers like onClick={async () => ...} are fine; React ignores the returned promise.
        '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
        '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'separate-type-imports' }],
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description' }],
        // Every disable names its rule and says why (`-- reason`).
        '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
        'no-restricted-properties': ['error', AMBIENT_ENV],
        ...syntax(EXPORT_ALL, DEFAULT_EXPORT, INLINE_SLEEP),
        'max-lines': ['warn', { max: MAX_LINES, skipBlankLines: true, skipComments: true }],
        'max-params': ['warn', MAX_PARAMS],
        complexity: ['warn', MAX_COMPLEXITY],
      },
    },
    parameterizedSqlFiles.length
      ? {
          files: parameterizedSqlFiles,
          ignores: TEST_FILES,
          plugins: { 'agent-config': { rules: { 'no-interpolated-sql': noInterpolatedSql } } },
          rules: { 'agent-config/no-interpolated-sql': ['error', { fragment: sqlFragment }] },
        }
      : {},
    // Domain code logs through the injected Logger, which redacts secrets; console bypasses it.
    noConsoleFiles.length ? { files: noConsoleFiles, ignores: TEST_FILES, rules: { 'no-console': 'error' } } : {},
    // Same-input-same-output code: decisions take `now`, ids and config as arguments, so tests need no fake timers.
    pureCorePaths.length
      ? {
          files: pureCorePaths,
          ignores: TEST_FILES,
          rules: {
            'no-restricted-globals': ['error', ...PURE_CORE_GLOBALS],
            ...syntax(EXPORT_ALL, DEFAULT_EXPORT, INLINE_SLEEP, ...AMBIENT_CLOCK),
          },
        }
      : {},
    entryPoints.length ? { files: entryPoints, rules: { 'no-restricted-properties': 'off' } } : {},
    delayModules.length ? { files: delayModules, rules: syntax(EXPORT_ALL, DEFAULT_EXPORT) } : {},
    {
      files: TEST_FILES,
      rules: { 'no-restricted-properties': 'off', 'max-lines': 'off', ...syntax(EXPORT_ALL, DEFAULT_EXPORT) },
    },
    // Tool configs are composition roots too (CI flags, test DB URLs), so they may read env.
    { files: TOOL_CONFIG_FILES, rules: { 'no-restricted-properties': 'off' } },
    // After the test block, so a test file the framework needs default-exported can be listed.
    { files: [...TOOL_CONFIG_FILES, ...defaultExportAllowed], rules: syntax(EXPORT_ALL, INLINE_SLEEP) },
    { files: ['**/*.{js,mjs}'], languageOptions: { globals: { ...globals.node } } },
    {
      files: ['**/*.cjs'],
      languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
      rules: { '@typescript-eslint/no-require-imports': 'off' },
    },
    prettier,
  )
}
