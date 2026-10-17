import type { DbClient } from '../../platform/db'
import { findProductId, normalizeName } from '../catalog'
import { findLatestAmount } from './store'

// Latest saved amount for a product as a listing names it; null when the product or its price is unknown.
export async function latestAmountForName(db: DbClient, name: string): Promise<number | null> {
  const productId = await findProductId(db, normalizeName(name))
  return productId === null ? null : findLatestAmount(db, productId)
}
