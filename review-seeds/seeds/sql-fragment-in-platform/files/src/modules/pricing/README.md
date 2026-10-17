# pricing

Features: discount against a reference price, price storage per product, latest price lookup.
Tables owned: `prices`.
Public API: `index.ts` (`computeDiscount`, `getLatestAmount`, `savePrice`).
Layers: `domain/` (pure), `store.ts` (all SQL).
Tier 1: may import `catalog` through its `index.ts`.
