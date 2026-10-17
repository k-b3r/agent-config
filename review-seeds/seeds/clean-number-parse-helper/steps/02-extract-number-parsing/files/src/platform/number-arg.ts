// Parses a numeric query value: the value of Number(raw) when that is finite, otherwise null.
// An absent value gives null; an empty string is present input and parses as 0, as Number does.
export function parseFiniteNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}
