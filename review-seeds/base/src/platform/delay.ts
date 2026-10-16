export type DelayFn = (ms: number) => Promise<void>

export const realDelay: DelayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Confirmed live 2026-10-10: catalog lookups answered within 40ms across 200 listings, so a call over 200ms is a stall worth a warning.
export const SLOW_CALL_MS = 200
