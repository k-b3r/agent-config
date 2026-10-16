// Latest saved amount for a product.
export const LATEST_PRICE_SQL = 'SELECT amount FROM prices WHERE product_id = $1 ORDER BY day DESC LIMIT 1'
