# pricing

Features: discount against a reference price, price storage per product, latest price lookup by product name.
Tables owned: `prices`.
Public API: `index.ts` (`computeDiscount`, `findLatestAmountByName`, `savePrice`).
Layers: `domain/` (pure), `store.ts` (all SQL).
Tier 1: may import `catalog` through its `index.ts`.
