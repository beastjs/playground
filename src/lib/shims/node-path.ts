/**
 * Browser stand-in for `node:path`, for `beast-tsrx` in the playground. Its
 * compiler only derives a component name from the filename (`basename`,
 * `extname`); the rest is imported by its file-system project builder, which
 * never runs in the browser.
 */
export const sep = '/'

export function basename(path: string, suffix?: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  return suffix !== undefined && base.endsWith(suffix) && base !== suffix ? base.slice(0, -suffix.length) : base
}

export function extname(path: string): string {
  const base = basename(path)
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot)
}

export function dirname(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash <= 0 ? (slash === 0 ? '/' : '.') : path.slice(0, slash)
}

export function isAbsolute(path: string): boolean {
  return path.startsWith('/')
}

export function resolve(...paths: string[]): string {
  return paths.join('/')
}

export function relative(_from: string, to: string): string {
  return to
}
