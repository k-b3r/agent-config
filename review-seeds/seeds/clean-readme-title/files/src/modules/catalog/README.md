# Catalog

Features: product normalization, product lookup by name.
Tables owned: `products`.
Public API: `index.ts` (`normalizeName`, `findProductId`).
Layers: `domain/` (pure), `store.ts` (all SQL).
Tier 0: imports no other module.
