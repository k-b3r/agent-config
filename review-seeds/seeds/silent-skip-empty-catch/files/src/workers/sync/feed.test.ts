import { parseListings } from './feed'

const line = (price: unknown) => JSON.stringify({ name: 'iphone 12', price, referencePrice: 900, day: '2026-10-17' })

describe('parseListings', () => {
  it('parseListings turns each well-formed line into a listing', () => {
    expect(parseListings([line(500)])).toEqual([{ name: 'iphone 12', price: 500, referencePrice: 900, day: '2026-10-17' }])
  })
  it('parseListings leaves out a line that is not valid JSON', () => {
    expect(parseListings(['{oops', line(500)])).toHaveLength(1)
  })
  it('parseListings leaves out a line whose price is not a number', () => {
    expect(parseListings([line('cheap'), line(500)])).toHaveLength(1)
  })
})
