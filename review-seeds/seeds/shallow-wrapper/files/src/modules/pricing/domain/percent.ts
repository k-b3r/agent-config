export function roundPercent(value: number): number {
  return toWholeNumber(value)
}

export function toWholeNumber(value: number): number {
  return Math.round(value)
}
