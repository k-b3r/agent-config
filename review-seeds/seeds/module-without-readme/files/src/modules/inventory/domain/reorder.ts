// Units to order so stock reaches the target level; never negative.
export function reorderQuantity(onHand: number, target: number): number {
  return Math.max(0, target - onHand)
}
