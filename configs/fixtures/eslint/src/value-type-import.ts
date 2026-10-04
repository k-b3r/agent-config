import { Readable } from 'node:stream'

export function isReadable(stream: Readable): boolean {
  return stream.readable
}
