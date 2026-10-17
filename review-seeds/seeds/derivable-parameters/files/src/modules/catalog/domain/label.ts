export interface Product {
  id: number
  name: string
  price: number
}

export function productLabel(product: Product, id: number, name: string): string {
  return `#${id} ${name}: ${product.price}`
}
