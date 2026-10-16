import { MIN_VALID_PRICE } from './discount'

abstract class JunkRule {
  abstract matches(price: number): boolean
}

class BelowFloorRule extends JunkRule {
  matches(price: number): boolean {
    return price < MIN_VALID_PRICE
  }
}

class RepeatedDigitsRule extends JunkRule {
  matches(price: number): boolean {
    return /^(\d)\1+$/.test(String(price))
  }
}

const RULES: JunkRule[] = [new BelowFloorRule(), new RepeatedDigitsRule()]

export function isJunkPrice(price: number): boolean {
  return RULES.some((rule) => rule.matches(price))
}
