// Pure: the caller passes `now`, so the same input always gives the same output.
export const addDays = (from: Date, days: number): Date => new Date(from.getTime() + days * 86_400_000)

export const isDue = (renewsAt: Date, now: Date): boolean => renewsAt.getTime() <= now.getTime()
