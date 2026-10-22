import { reportableDiscount } from '../../modules/pricing'

// Parse, call one public module function, shape the response.
export function discountRoute(query: { price?: string; reference?: string; minimum?: string }): { status: number; body: unknown } {
  const price = Number(query.price)
  const reference = Number(query.reference)
  // An empty optional value means the caller did not ask for a minimum.
  const minimum = query.minimum === undefined || query.minimum.trim() === '' ? undefined : Number(query.minimum)
  if (!Number.isFinite(price) || !Number.isFinite(reference) || (minimum !== undefined && !Number.isFinite(minimum))) {
    return { status: 400, body: { error: 'price, reference and minimum must be numbers' } }
  }
  return { status: 200, body: { discountPercent: reportableDiscount(price, reference, minimum) } }
}
