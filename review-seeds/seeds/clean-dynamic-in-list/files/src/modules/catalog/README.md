# catalog

Features: product normalization, product lookup by name (single and batch).
Tables owned: `products`.
Public API: `index.ts` (`normalizeName`, `findProductId`, `findProductIds`).
Layers: `domain/` (pure), `store.ts` (all SQL).
Tier 0: imports no other module.
