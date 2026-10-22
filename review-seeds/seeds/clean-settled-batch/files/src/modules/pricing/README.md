# pricing

Features: discount against a reference price, price storage per product, reference price fetch from the reference API.
Tables owned: `prices`.
Public API: `index.ts` (`computeDiscount`, `savePrice`, `fetchReferencePrices`, `ReferenceApiError`).
Layers: `domain/` (pure), `store.ts` (all SQL), `reference-prices.ts` (reference API lookups, paced and retried).
Tier 1: may import `catalog` through its `index.ts`.
