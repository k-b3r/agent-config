// An entry point may load a heavy dep through a public API; only public API index files must stay light.
import { launch } from '../../modules/collection'

export const browse = (): unknown => launch()
