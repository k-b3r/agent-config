import { parseFiniteNumber } from './number-arg'

describe('parseFiniteNumber', () => {
  it('parseFiniteNumber returns null when the value is absent', () => {
    expect(parseFiniteNumber(undefined)).toBeNull()
  })
  it('parseFiniteNumber returns 0 for an empty string, the same as Number', () => {
    expect(parseFiniteNumber('')).toBe(0)
  })
  it('parseFiniteNumber returns the number for a numeric string', () => {
    expect(parseFiniteNumber('12.5')).toBe(12.5)
  })
  it.each(['abc', 'Infinity', 'NaN'])('parseFiniteNumber returns null for %j', (raw) => {
    expect(parseFiniteNumber(raw)).toBeNull()
  })
})
