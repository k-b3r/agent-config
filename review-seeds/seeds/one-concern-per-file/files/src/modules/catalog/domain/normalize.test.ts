import { formatAmount, normalizeName } from './normalize'

describe('normalizeName', () => {
  it('normalizeName lowercases and collapses repeated spaces', () => {
    expect(normalizeName('  iPhone   12 ')).toBe('iphone 12')
  })
  it('formatAmount rounds to whole units and groups thousands', () => {
    expect(formatAmount(1234.6)).toBe('PHP 1,235')
  })
})
