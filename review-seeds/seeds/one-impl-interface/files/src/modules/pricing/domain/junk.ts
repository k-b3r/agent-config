import { MIN_VALID_PRICE } from './discount'

export interface JunkPriceChecker {
  isJunk(price: number): boolean
}

export class FloorJunkPriceChecker implements JunkPriceChecker {
  isJunk(price: number): boolean {
    return price < MIN_VALID_PRICE || /^(\d)\1+$/.test(String(price))
  }
}

export function isJunkPrice(price: number, checker: JunkPriceChecker = new FloorJunkPriceChecker()): boolean {
  return checker.isJunk(price)
}
