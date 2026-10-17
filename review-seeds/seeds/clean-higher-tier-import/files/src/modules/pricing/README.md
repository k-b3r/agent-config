# pricing

Features: discount against a reference price, price storage per product, latest price lookup by product name.
Tables owned: `prices`.
Public API: `index.ts` (`computeDiscount`, `latestAmountForName`, `savePrice`).
Layers: `domain/` (pure), `store.ts` (all SQL), `lookup.ts` (name lookup over catalog and the store).
Tier 1: may import `catalog` through its `index.ts` (`findProductId`, `normalizeName` for the name lookup).
