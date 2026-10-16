// Product names are compared lowercase with single spaces, so "iPhone  12" and "iphone 12" are one product.
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}
