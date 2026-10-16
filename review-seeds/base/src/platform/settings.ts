// Operator-tunable settings, read from the settings table; code defaults are the fallback.
export interface Settings {
  get(key: string): number | undefined
}
