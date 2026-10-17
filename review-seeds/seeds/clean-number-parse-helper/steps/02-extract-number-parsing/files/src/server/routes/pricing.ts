import { reportableDiscount } from '../../modules/pricing'
import { parseFiniteNumber } from '../../platform/number-arg'

// Parse, call one public module function, shape the response.
export function discountRoute(query: { price?: string; reference?: string; minimum?: string }): { status: number; body: unknown } {
  const price = parseFiniteNumber(query.price)
  const reference = parseFiniteNumber(query.reference)
  // An empty optional value means the caller did not ask for a minimum.
  const minimum = query.minimum === undefined || query.minimum.trim() === '' ? undefined : parseFiniteNumber(query.minimum)
  if (price === null || reference === null || minimum === null) {
    return { status: 400, body: { error: 'price, reference and minimum must be numbers' } }
  }
  return { status: 200, body: { discountPercent: reportableDiscount(price, reference, minimum) } }
}
