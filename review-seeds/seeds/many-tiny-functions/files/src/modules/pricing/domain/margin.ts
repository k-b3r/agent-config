export function grossProfit(price: number, cost: number): number {
  return price - cost
}

export function profitRatio(profit: number, price: number): number {
  return profit / price
}

export function asPercent(ratio: number): number {
  return ratio * 100
}

export function roundWhole(value: number): number {
  return Math.round(value)
}

export function marginPercent(price: number, cost: number): number {
  return roundWhole(asPercent(profitRatio(grossProfit(price, cost), price)))
}
