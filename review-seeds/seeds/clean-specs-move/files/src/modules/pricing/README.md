# pricing

Features: discount against a reference price, price storage per product.
Tables owned: `prices`.
Public API: `index.ts` (`computeDiscount`, `savePrice`).
Layers: `domain/` (pure), `store.ts` (all SQL).
Tier 1: may import `catalog` through its `index.ts`.
Writes: `savePrice` upserts by product and day, so a rerun is safe.
