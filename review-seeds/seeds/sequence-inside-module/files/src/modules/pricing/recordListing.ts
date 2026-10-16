import { findProductId, normalizeName } from '../catalog'
import type { DbClient } from '../../platform/db'
import { computeDiscount } from './domain/discount'
import { savePrice } from './store'

export interface PriceListing {
  name: string
  price: number
  referencePrice: number
  day: string
}

// Saves the listing's price when the product is known and the price is usable.
export async function recordListing(db: DbClient, listing: PriceListing, saveEnabled: boolean): Promise<'unknown-product' | 'saved' | 'skipped'> {
  const productId = await findProductId(db, normalizeName(listing.name))
  if (productId === null) return 'unknown-product'
  if (!saveEnabled || computeDiscount(listing.price, listing.referencePrice) === null) return 'skipped'
  await savePrice(db, productId, listing.price, listing.day)
  return 'saved'
}
