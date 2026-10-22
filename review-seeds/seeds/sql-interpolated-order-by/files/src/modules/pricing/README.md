# pricing

Features: discount against a reference price, price storage per product, sorted price listing.
Tables owned: `prices`.
Public API: `index.ts` (`computeDiscount`, `savePrice`, `listPrices`).
Layers: `domain/` (pure), `store.ts` (all SQL).
Tier 1: may import `catalog` through its `index.ts`.
