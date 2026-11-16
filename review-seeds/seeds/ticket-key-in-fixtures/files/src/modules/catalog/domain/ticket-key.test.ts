import { parseTicketKey } from './ticket-key'

describe('parseTicketKey', () => {
  it('parseTicketKey returns the key typed as buy-421 in upper case', () => {
    expect(parseTicketKey(' buy-421 ')).toBe('BUY-421')
  })
  it('parseTicketKey drops a link copied from https://linear.app/labx/issue/BUY-421/stock-count', () => {
    expect(parseTicketKey('https://linear.app/labx/issue/BUY-421/stock-count')).toBeNull()
  })
})
