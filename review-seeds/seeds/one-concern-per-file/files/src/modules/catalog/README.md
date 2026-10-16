# catalog

Features: product normalization, product lookup by name, amount formatting.
Tables owned: `products`.
Public API: `index.ts` (`normalizeName`, `formatAmount`, `findProductId`).
Layers: `domain/` (pure), `store.ts` (all SQL).
Tier 0: imports no other module.
