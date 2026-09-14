/**
 * What the converter tells its caller: a thrown error for input it cannot read
 * at all, and warnings for input it converted with something lost along the
 * way.
 */

import ts from 'typescript'
import type { ConvertContext } from './context'

/** Thrown when the input cannot be parsed as TSX. */
export class BtsxConversionError extends Error {
  readonly diagnostics: readonly string[]
  constructor(diagnostics: readonly string[]) {
    super(`Input is not valid TSX:\n${diagnostics.join('\n')}`)
    this.name = 'BtsxConversionError'
    this.diagnostics = diagnostics
  }
}

/**
 * Every way a conversion can succeed and still not be faithful. Each one names
 * something the output dropped or could not express, so a caller can decide
 * whether that matters instead of discovering it at runtime.
 */
export type ConversionDiagnosticCode =
  /** A React import with no Octane counterpart was removed. */
  | 'dropped-import'
  /** A `React.Name` with no Octane counterpart was left referring to React. */
  | 'unresolved-react-member'
  /** A `return` inside a loop, `try` or fall-through branch has no template form. */
  | 'unconverted-early-return'
  /** A `switch` arm whose body is not a plain return was emitted empty. */
  | 'unconverted-switch-case'
  /** `<Suspense>` / `<ErrorBoundary>` props other than `fallback` have no place on `try`. */
  | 'dropped-boundary-prop'
  /** A `.map` callback's third parameter was re-read from an expression with side effects. */
  | 'reevaluated-iterable'
  /** A component overload signature was removed; the implementation carries the type. */
  | 'dropped-overload'
  /** A generated or unwrapped component's props could not be typed. */
  | 'untyped-props'

export interface ConversionDiagnostic {
  code: ConversionDiagnosticCode
  message: string
  /** 1-based position in the TSX input. */
  line: number
  column: number
}

/** Records a warning against the node in the input it concerns. */
export function report(ctx: ConvertContext, node: ts.Node, code: ConversionDiagnosticCode, message: string): void {
  const { line, character } = ctx.sourceFile.getLineAndCharacterOfPosition(node.getStart(ctx.sourceFile))
  const diagnostic = { code, message, line: line + 1, column: character + 1 }
  // The same node can be rendered twice (a forwarded ref's type is written in
  // both the component and the file's template), and should be reported once.
  const duplicate = ctx.diagnostics.some(
    (d) => d.code === code && d.line === diagnostic.line && d.column === diagnostic.column && d.message === message
  )
  if (!duplicate) ctx.diagnostics.push(diagnostic)
}

/**
 * The TypeScript parser is error-tolerant: it happily returns a tree full of
 * garbage for garbage input. Surfacing the diagnostics turns a silently
 * nonsensical conversion into an actionable message.
 */
export function assertParsed(sourceFile: ts.SourceFile): void {
  const diagnostics = (
    sourceFile as ts.SourceFile & {
      parseDiagnostics?: ts.DiagnosticWithLocation[]
    }
  ).parseDiagnostics
  if (!diagnostics || diagnostics.length === 0) return
  const messages = diagnostics.slice(0, 5).map((d) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(d.start)
    const text = ts.flattenDiagnosticMessageText(d.messageText, ' ')
    return `${line + 1}:${character + 1} ${text}`
  })
  throw new BtsxConversionError(messages)
}
