import heavy from 'heavy-lib'
import { LOOP_DELAY_MS } from '../../workers/collect/index'
export const paginate = (): unknown => [heavy, LOOP_DELAY_MS]
