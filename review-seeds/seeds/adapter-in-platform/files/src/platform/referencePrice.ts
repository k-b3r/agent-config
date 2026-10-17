import type { ReferencePrice } from '../modules/pricing'

export interface HttpClient {
  get(url: string): Promise<{ json(): Promise<unknown> }>
}

const REFERENCE_PRICE_URL = 'https://prices.example.com/reference'

// Null when the service answers without a numeric amount.
export async function fetchReferencePrice(http: HttpClient, productId: number, day: string): Promise<ReferencePrice | null> {
  const response = await http.get(`${REFERENCE_PRICE_URL}/${productId}`)
  const body = await response.json()
  const amount = typeof body === 'object' && body !== null ? (body as { amount?: unknown }).amount : undefined
  return typeof amount === 'number' ? { productId, amount, day } : null
}
