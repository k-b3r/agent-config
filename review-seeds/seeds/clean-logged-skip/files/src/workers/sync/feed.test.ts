import { parseListings } from './feed'

const line = (price: unknown) => JSON.stringify({ name: 'iphone 12', price, referencePrice: 900, day: '2026-10-17' })
const logger = () => ({ info: vi.fn(), warn: vi.fn() })

describe('parseListings', () => {
  it('parseListings turns each well-formed line into a listing', () => {
    expect(parseListings([line(500)], logger())).toEqual([{ name: 'iphone 12', price: 500, referencePrice: 900, day: '2026-10-17' }])
  })
  it('parseListings skips a line that is not valid JSON and logs its line number and reason', () => {
    const log = logger()
    expect(parseListings(['{oops', line(500)], log)).toHaveLength(1)
    expect(log.warn).toHaveBeenCalledWith('skipped feed line', { line: 1, reason: expect.stringContaining('SyntaxError') })
  })
  it('parseListings skips a line whose price is not a number and logs why', () => {
    const log = logger()
    expect(parseListings([line('cheap')], log)).toEqual([])
    expect(log.warn).toHaveBeenCalledWith('skipped feed line', { line: 1, reason: 'Error: not a listing' })
  })
})
