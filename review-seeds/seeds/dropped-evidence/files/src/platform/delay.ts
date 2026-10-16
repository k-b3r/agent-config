export type DelayFn = (ms: number) => Promise<void>

export const realDelay: DelayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// A call over this is a stall worth a warning.
export const SLOW_CALL_MS = 1000
