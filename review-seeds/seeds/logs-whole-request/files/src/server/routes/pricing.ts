import { computeDiscount, savePrice } from '../../modules/pricing'
import type { DbClient } from '../../platform/db'
import type { Logger } from '../../platform/logger'

export interface PriceRequest {
  headers: Record<string, string>
  body: unknown
}

// Parse, call one public module function, shape the response.
export function discountRoute(query: { price?: string; reference?: string }): { status: number; body: unknown } {
  const price = Number(query.price)
  const reference = Number(query.reference)
  if (!Number.isFinite(price) || !Number.isFinite(reference)) return { status: 400, body: { error: 'price and reference must be numbers' } }
  return { status: 200, body: { discountPercent: computeDiscount(price, reference) } }
}

function isPriceBody(body: unknown): body is { productId: number; amount: number; day: string } {
  if (typeof body !== 'object' || body === null) return false
  const fields = body as Record<string, unknown>
  return typeof fields.productId === 'number' && typeof fields.amount === 'number' && typeof fields.day === 'string'
}

// Parse, call one public module function, shape the response. Answers 400 when the body is not { productId, amount, day }.
export async function recordPriceRoute(
  deps: { db: DbClient; logger: Logger },
  request: PriceRequest,
): Promise<{ status: number; body: unknown }> {
  if (!isPriceBody(request.body)) {
    deps.logger.warn('rejected price post: body is not { productId, amount, day }', { request })
    return { status: 400, body: { error: 'productId, amount and day are required' } }
  }
  await savePrice(deps.db, request.body.productId, request.body.amount, request.body.day)
  return { status: 200, body: { saved: true } }
}
