import type { DbClient } from '../platform/db'
import { findAlertAmount } from '../repositories/alert-repository'

// An alert fires when the new price is strictly below its amount; a product without an alert never fires.
export async function shouldAlert(db: DbClient, productId: number, newAmount: number): Promise<boolean> {
  const below = await findAlertAmount(db, productId)
  return below !== null && newAmount < below
}
