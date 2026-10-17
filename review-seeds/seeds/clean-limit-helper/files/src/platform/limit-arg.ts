// The optional positive-integer limit argument of a worker CLI.
// undefined when absent; throws on anything else, so a typo never turns into an uncapped run.
export function parseLimitArg(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`invalid limit argument: "${raw}"`)
  return parsed
}
