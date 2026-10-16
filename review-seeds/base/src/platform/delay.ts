export type DelayFn = (ms: number) => Promise<void>

export const realDelay: DelayFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
