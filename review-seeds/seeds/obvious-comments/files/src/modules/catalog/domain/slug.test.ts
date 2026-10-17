import { toSlug } from './slug'

describe('toSlug', () => {
  it('toSlug joins the words of a name with single dashes', () => {
    expect(toSlug('  iPhone   12! ')).toBe('iphone-12')
  })
})
