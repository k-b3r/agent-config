# catalog

Features: product normalization, product lookup by name, review-screen listing label.
Tables owned: `products`.
Public API: `index.ts` (`normalizeName`, `findProductId`, `listingLabel`).
Layers: `domain/` (pure), `store.ts` (all SQL).
Tier 0: imports no other module.
