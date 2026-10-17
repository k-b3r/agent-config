import { computeDiscount } from '../../modules/pricing'

// Parse, call one public module function, shape the response.
export function discountRoute(query: { price?: string; reference?: string }): { status: number; body: unknown } {
  const price = parseNumber(query.price)
  const reference = parseNumber(query.reference)
  if (!Number.isFinite(price) || !Number.isFinite(reference)) return { status: 400, body: { error: 'price and reference must be numbers' } }
  return { status: 200, body: { discountPercent: computeDiscount(price, reference) } }
}

// An empty or blank string is missing input, not zero.
function parseNumber(raw: string | undefined): number {
  return raw === undefined || raw.trim() === '' ? NaN : Number(raw)
}
