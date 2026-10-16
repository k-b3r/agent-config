# Context

## Architecture

**Decision (2026-10-17): modular monolith.** Two features with their own tables (catalog, pricing), one worker, one server; no part must scale or deploy independently.
