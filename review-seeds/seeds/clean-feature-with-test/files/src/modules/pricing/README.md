# pricing

Features: discount against a reference price, price drop alerts, price storage per product.
Tables owned: `prices`.
Public API: `index.ts` (`computeDiscount`, `shouldAlert`, `savePrice`).
Layers: `domain/` (pure), `store.ts` (all SQL).
Tier 1: may import `catalog` through its `index.ts`.
