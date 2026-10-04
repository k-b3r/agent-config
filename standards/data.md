# Data: examples

Rules live in `CODING_STANDARDS.md` → Data.

## Derive at query time, store raw inputs

Don't:
```sql
ALTER TABLE orders ADD COLUMN total NUMERIC; -- goes stale when a line item changes
```

Do:
```sql
SELECT SUM(quantity * unit_price) AS total FROM order_items WHERE order_id = $1
```

## Feature data in side tables

Don't: widen a core table for one feature.
```sql
ALTER TABLE products ADD COLUMN isbn TEXT, ADD COLUMN author TEXT, ADD COLUMN page_count INT;
```

Do: a 1:1 side table that dies with its parent.
```sql
CREATE TABLE book_details (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  isbn TEXT,
  author TEXT,
  page_count INT
);
```
