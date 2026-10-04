import { normalizeTitle } from '../../modules/catalog/normalize'
import { a } from './a'
export const LOOP_DELAY_MS = 1000
export const run = (): string => normalizeTitle(a())
