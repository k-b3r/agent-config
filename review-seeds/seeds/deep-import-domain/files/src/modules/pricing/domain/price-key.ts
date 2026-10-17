import { normalizeName } from '../../catalog/domain/normalize'

// One price row exists per product and day, so two spellings of a name share a key.
export function priceKey(name: string, day: string): string {
  return `${normalizeName(name)}@${day}`
}
