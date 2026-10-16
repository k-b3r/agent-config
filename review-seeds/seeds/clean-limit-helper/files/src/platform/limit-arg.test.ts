import { parseLimitArg } from './limit-arg'

describe('parseLimitArg', () => {
  it('parseLimitArg returns undefined when no limit was given', () => {
    expect(parseLimitArg(undefined)).toBeUndefined()
  })
  it('parseLimitArg returns the number for a positive whole number', () => {
    expect(parseLimitArg('50')).toBe(50)
  })
  it.each(['abc', '0', '-3', '1.5', ''])('parseLimitArg rejects %j', (raw) => {
    expect(() => parseLimitArg(raw)).toThrow('invalid limit argument')
  })
})
