import type { Readable } from 'node:stream'

export function describeStream(stream: Readable): string {
  return stream.readable ? 'open' : 'closed'
}
