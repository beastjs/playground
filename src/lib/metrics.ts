/**
 * Size of a source text, for the counts shown beside each panel title.
 *
 * The same three measurements are taken on both sides, with the same rules, so
 * the TSX and BTSX numbers are comparable — which is the only reason to show
 * them at all.
 */
export interface Metrics {
  /** Characters, ignoring trailing whitespace. */
  chars: number
  /** Lines that carry something — blank lines are not code. */
  lines: number
  /** Lexical tokens: see `TOKEN`. */
  tokens: number
}

/**
 * One token is an identifier, a number, a whole string literal, a multi-character
 * operator, or a single punctuation mark. This is a lexer's idea of a token, not
 * a language model's; it is deliberately the same rule for TSX and for BTSX,
 * which no real tokenizer could be, since only one of the two is TypeScript.
 */
const TOKEN =
  /[A-Za-z_$][A-Za-z0-9_$]*|\d[\d._]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|=>|===|!==|==|!=|<=|>=|&&|\|\||\?\?|\.\.\.|\S/gu

export function measure(text: string): Metrics {
  const trimmed = text.trimEnd()
  return {
    chars: trimmed.length,
    lines: trimmed.split('\n').filter((line) => line.trim() !== '').length,
    tokens: trimmed.match(TOKEN)?.length ?? 0
  }
}

/**
 * `1234, 'line'` -> `1,234 lines`: grouped so a four-digit count still reads at
 * a glance, and singular when there is one of something.
 */
export function formatCount(value: number, unit: string): string {
  return `${value.toLocaleString('en-US')} ${unit}${value === 1 ? '' : 's'}`
}

/**
 * How much smaller `after` is than `before`, as `-42%`. Null when there is
 * nothing to compare against, or when the conversion did not save anything.
 */
export function formatReduction(before: number, after: number): string | null {
  if (before === 0 || after >= before) return null
  return `-${Math.round(((before - after) / before) * 100)}%`
}
