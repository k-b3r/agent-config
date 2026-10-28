# catalog

Features: product normalization, tracker key normalization, product lookup by name.
Tables owned: `products`.
Public API: `index.ts` (`normalizeName`, `parseTicketKey`, `findProductId`).
Layers: `domain/` (pure), `store.ts` (all SQL).
Tier 0: imports no other module.
