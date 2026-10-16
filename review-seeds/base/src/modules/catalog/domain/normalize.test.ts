import { normalizeName } from './normalize'

describe('normalizeName', () => {
  it('normalizeName lowercases and collapses repeated spaces', () => {
    expect(normalizeName('  iPhone   12 ')).toBe('iphone 12')
  })
})
