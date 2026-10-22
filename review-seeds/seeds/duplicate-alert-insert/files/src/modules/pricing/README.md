# pricing

Features: discount against a reference price, price storage per product, price alert queue.
Tables owned: `prices`, `price_alerts`.
Public API: `index.ts` (`computeDiscount`, `savePrice`, `recordPriceAlert`).
Layers: `domain/` (pure), `store.ts` (all SQL).
Tier 1: may import `catalog` through its `index.ts`.
