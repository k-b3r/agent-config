import { computeDiscount } from '../../modules/pricing'

// Parse, call one public module function, shape the response.
export function discountRoute(query: { price?: string; reference?: string }): { status: number; body: unknown } {
  const price = Number(query.price)
  const reference = Number(query.reference)
  return { status: 200, body: { discountPercent: computeDiscount(price, reference) } }
}
