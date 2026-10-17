import type { DbClient } from '../../../platform/db'
import { computeDiscount as discountOf } from '../domain/discount'
import { savePrice as storePrice } from '../store'

export function computeDiscount(price: number, referencePrice: number): number | null {
  return discountOf(price, referencePrice)
}

export function savePrice(db: DbClient, productId: number, amount: number, day: string): Promise<void> {
  return storePrice(db, productId, amount, day)
}
