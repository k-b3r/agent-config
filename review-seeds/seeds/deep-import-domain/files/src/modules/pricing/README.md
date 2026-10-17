# pricing

Features: discount against a reference price, price storage per product, price key per product name and day.
Tables owned: `prices`.
Public API: `index.ts` (`computeDiscount`, `priceKey`, `savePrice`).
Layers: `domain/` (pure), `store.ts` (all SQL).
Tier 1: may import `catalog` through its `index.ts`.
