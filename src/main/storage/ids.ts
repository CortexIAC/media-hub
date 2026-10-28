import { createHash } from 'node:crypto'
import { normalizePathKey } from './paths'

export function hashId(value: string): string {
  return createHash('sha1').update(value).digest('hex')
}

export function trackIdForPath(filePath: string): string {
  return hashId(normalizePathKey(filePath))
}

export function folderIdForPath(folderPath: string): string {
  return hashId(`folder:${normalizePathKey(folderPath)}`)
}
