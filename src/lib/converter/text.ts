/** Line and string utilities shared by every emitter. Nothing here knows about the AST. */

export const INDENT = '  '

export function indentLines(lines: string[], levels: number): string[] {
  const prefix = INDENT.repeat(levels)
  return lines.map((line) => (line.length === 0 ? line : prefix + line))
}

/** Convert single-quoted string literals to double-quoted, leaving already-double-quoted text alone. */
export function toDoubleQuotedString(raw: string): string {
  const inner = raw.slice(1, -1)
  // Un-escape \' then escape any raw " that weren't already escaped.
  const unescapedSingle = inner.replace(/\\'/g, "'")
  const escapedDouble = unescapedSingle.replace(/(?<!\\)"/g, '\\"')
  return `"${escapedDouble}"`
}

export function quote(text: string): string {
  return `"${text}"`
}

export function stripQuotes(text: string): string {
  return text.slice(1, -1)
}

export function ensureSemicolon(text: string): string {
  return text.endsWith(';') ? text : `${text};`
}

/**
 * Splits one printed fragment into `~` continuation lines. Beast rejoins them
 * with a single space, so each line is trimmed and blank lines are dropped —
 * what comes back is the fragment as one logical line.
 */
export function continuationLines(text: string, pad: string): string[] {
  const lines: string[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length > 0) lines.push(`${pad}~ ${trimmed}`)
  }
  return lines
}

/** The HTML entities JSX text decodes, which a string expression would print as written. */
export function decodeEntities(text: string): string {
  const named: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", nbsp: '\u00a0' }
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) return String.fromCodePoint(parseInt(entity.slice(2), 16))
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10))
    return named[entity.toLowerCase()] ?? whole
  })
}

/** JSX whitespace normalization, matching the standard React/Babel algorithm closely enough for our needs. */
export function normalizeJsxText(raw: string): string {
  const lines = raw.split('\n')
  if (lines.length === 1) return lines[0]

  let result = ''
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    const isFirst = i === 0
    const isLast = i === lines.length - 1

    if (!isFirst) line = line.replace(/^[ \t]+/, '')
    if (!isLast) line = line.replace(/[ \t]+$/, '')

    if (line.length === 0) continue

    if (result.length > 0 && !/\s$/.test(result)) result += ' '
    result += line
  }
  return result
}
