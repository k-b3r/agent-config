// Shared ESLint base for TypeScript repos: the `tool` rules of CODING_STANDARDS.md
// and languages/typescript.md. A repo's eslint.config.js spreads it, then adds
// its own blocks (framework plugins, extra boundaries).
import js from '@eslint/js'
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs'
import prettier from 'eslint-config-prettier'
import globals from 'globals'
import tseslint from 'typescript-eslint'

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
 * @param {string[]} [options.defaultExportAllowed] framework files that must default-export (e.g. Next.js pages)
 * @param {string[]} [options.ignores]
 */
export function baseConfig({
  tsconfigRootDir,
  allowDefaultProject = [],
  entryPoints = [],
  delayModules = [],
  defaultExportAllowed = [],
  ignores = [],
}) {
  // A later block's no-restricted-syntax replaces earlier options, so each
  // scope restates the full list it keeps.
  const syntax = (...rules) => ({ 'no-restricted-syntax': ['error', ...rules] })

  return tseslint.config(
    { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', ...ignores] },
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
    entryPoints.length ? { files: entryPoints, rules: { 'no-restricted-properties': 'off' } } : {},
    delayModules.length ? { files: delayModules, rules: syntax(EXPORT_ALL, DEFAULT_EXPORT) } : {},
    { files: [...TOOL_CONFIG_FILES, ...defaultExportAllowed], rules: syntax(EXPORT_ALL, INLINE_SLEEP) },
    {
      files: TEST_FILES,
      rules: { 'no-restricted-properties': 'off', 'max-lines': 'off', ...syntax(EXPORT_ALL, DEFAULT_EXPORT) },
    },
    { files: ['**/*.{js,mjs}'], languageOptions: { globals: { ...globals.node } } },
    { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } } },
    prettier,
  )
}
