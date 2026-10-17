# pricing

Features: discount against a reference price with an optional reportable minimum, price storage per product.
Tables owned: `prices`.
Public API: `index.ts` (`computeDiscount`, `reportableDiscount`, `savePrice`).
Layers: `domain/` (pure), `store.ts` (all SQL).
Tier 1: may import `catalog` through its `index.ts`.
