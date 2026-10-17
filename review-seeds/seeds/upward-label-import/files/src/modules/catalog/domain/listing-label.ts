import { computeDiscount } from '../../pricing'
import { normalizeName } from './normalize'

// Review-screen label: the normalized name, with the discount when one can be computed.
export function listingLabel(name: string, price: number, referencePrice: number): string {
  const discount = computeDiscount(price, referencePrice)
  return discount === null ? normalizeName(name) : `${normalizeName(name)} (${discount}% off)`
}
