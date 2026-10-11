// ESLint rule: the SQL text passed to `.query()` takes values as $n parameters.
// A template literal may interpolate only SQL fragments built from constants,
// recognised by name (the `fragment` option, a regex tested against each
// expression's source text); anything else is a possible injection. Judging
// whether a fragment is really built from constants stays with the agent review.
export const DEFAULT_SQL_FRAGMENT = '^[A-Z][A-Z0-9_]*$|(Sql|SQL|Ctes|Lateral)\\b'

export const noInterpolatedSql = {
  meta: {
    type: 'problem',
    schema: [{ type: 'object', properties: { fragment: { type: 'string' } }, additionalProperties: false }],
    messages: {
      interpolated:
        'Pass `{{ text }}` as a $n parameter. Interpolate only SQL fragments built from constants (names matching /{{ fragment }}/), or disable this line with the reason it is safe.',
    },
  },
  create(context) {
    const fragment = new RegExp(context.options[0]?.fragment ?? DEFAULT_SQL_FRAGMENT)
    const { sourceCode } = context
    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression' || callee.property.name !== 'query') return
        const sql = node.arguments[0]
        if (sql?.type !== 'TemplateLiteral') return
        for (const expression of sql.expressions) {
          const text = sourceCode.getText(expression)
          if (!fragment.test(text)) {
            context.report({ node: expression, messageId: 'interpolated', data: { text, fragment: fragment.source } })
          }
        }
      },
    }
  },
}
