# Data: examples

Rules live in `CODING_STANDARDS.md` → Data.

## Derive at query time, store raw inputs

Don't:
```sql
ALTER TABLE listings ADD COLUMN price_per_sqm NUMERIC; -- goes stale when price or area changes
```

Do:
```sql
SELECT price_amount / NULLIF(floor_area_sqm, 0) AS price_per_sqm FROM listings ...
```

## Feature data in side tables

Don't: widen a core table for one feature.
```sql
ALTER TABLE listings ADD COLUMN bedrooms INT, ADD COLUMN lot_area NUMERIC, ADD COLUMN title_type TEXT;
```

Do: a 1:1 side table that dies with its parent.
```sql
CREATE TABLE real_estate_details (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  bedrooms INT,
  lot_area NUMERIC,
  title_type TEXT
);
```
