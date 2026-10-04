// Type-only edge to a heavy owner: erased at compile time, so it never loads heavy-lib.
import type { launch } from '../collection/browser'

export type Launcher = typeof launch

export function normalizeTitle(title: string): string {
  return title.trim()
}
