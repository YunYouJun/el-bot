import { Buffer } from 'node:buffer'

/** Bound each page by UTF-8 bytes without breaking surrogate pairs. */
export function pages(text: string, limit = 1400, sizeOf: (character: string) => number = Buffer.byteLength): string[] {
  const result: string[] = []
  let page = ''
  let bytes = 0
  for (const character of text) {
    const size = sizeOf(character)
    if (bytes + size > limit) {
      result.push(page)
      page = ''
      bytes = 0
    }
    page += character
    bytes += size
  }
  if (page || !result.length)
    result.push(page)
  return result
}
