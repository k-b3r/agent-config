// A tracker key typed or pasted next to a listing; anything else is dropped before it reaches the row.
const KEY = /^[A-Z]+-\d+$/

export function parseTicketKey(value: string): string | null {
  const key = value.trim().toUpperCase()
  return KEY.test(key) ? key : null
}
