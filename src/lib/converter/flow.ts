/** Function bodies: `setup` statements, and early returns rewritten as `if` / `elseif` / `else` chains. */

import ts from 'typescript'
import { containsReturn, endsWithBlock, isNullish, statementsOf, unwrapParens } from './ast'
import type { ConvertContext } from './context'
import { report } from './diagnostics'
import { branchBody, emitElementOrExpression, emitRootJsx } from './jsx'
import { liftHelpers } from './lift'
import { reindent, renderExpr, requoteSource } from './print'
import { INDENT, ensureSemicolon, indentLines } from './text'

/**
 * Renders a component's hoisted statements as `setup`. One statement that
 * prints on a single line uses the inline `setup <stmt>;` form; everything else
 * goes into a single indented `setup` block, which takes any number of
 * declarations and functions. The block form is also mandatory for a multi-line
 * statement (a block-bodied arrow, an `if`), because BTSX is line-oriented and
 * an unmarked continuation line at column zero would be parsed as markup.
 */
export function renderSetupBlock(
  ctx: ConvertContext,
  statements: readonly ts.Statement[],
  prelude: readonly string[] = []
): string[] {
  const rendered = [
    ...prelude.map((line) => [line]),
    ...statements.map((stmt) => reindent(renderSetupStatement(ctx, stmt)))
  ]
  if (rendered.length === 0) return []

  const [only] = rendered
  if (rendered.length === 1 && only.length === 1) return [`setup ${only[0]}`]

  // A multi-line statement gets a blank line on either side so its body reads
  // as one unit instead of running into the neighbouring declarations.
  const source: string[] = []
  rendered.forEach((lines, index) => {
    const previous = rendered[index - 1]
    if (previous && (previous.length > 1 || lines.length > 1)) source.push('')
    source.push(...lines)
  })
  return ['setup', ...indentLines(source, 1)]
}

/**
 * One hoisted statement as it is written in `setup`. A statement whose own
 * syntax already closes it — a function, an `if`, a loop, a `try` — takes no
 * semicolon; a declaration or expression statement does.
 */
function renderSetupStatement(ctx: ConvertContext, statement: ts.Statement): string {
  const text = requoteSource(ctx, statement)
  if (endsWithBlock(statement)) return text
  return ensureSemicolon(text)
}

export function splitBody(statements: readonly ts.Statement[]): {
  setupStatements: ts.Statement[]
  returnExpr: ts.Expression | null
} {
  const setupStatements: ts.Statement[] = []
  let returnExpr: ts.Expression | null = null
  for (const stmt of statements) {
    if (ts.isReturnStatement(stmt)) {
      returnExpr = stmt.expression ?? null
      continue
    }
    setupStatements.push(stmt)
  }
  return { setupStatements, returnExpr }
}

/**
 * A function body as `setup` statements and the template they precede. Helpers
 * that return JSX are lifted out of the statements first, and a body that
 * returns from inside an `if` becomes an `if` / `elseif` / `else` chain instead
 * of losing every return but the last.
 */
export function renderBody(ctx: ConvertContext, body: ts.ConciseBody): { setup: ts.Statement[]; template: string[] } {
  // An arrow function with a concise body has no statements to hoist into
  // `setup` lines — its whole body is the returned expression.
  if (!ts.isBlock(body)) return { setup: [], template: emitRootJsx(ctx, body) }

  // The helpers this body lifts are in scope for its template and nothing
  // else: a sibling component calling a prop of the same name must not mount
  // one of them.
  const outerHelpers = ctx.helpers
  ctx.helpers = new Map(outerHelpers)
  try {
    const statements = liftHelpers(ctx, body)
    if (hasGuardReturns(statements)) {
      if (canFlow(statements)) {
        const first = firstReturnIndex(statements)
        return {
          setup: statements.slice(0, first),
          template: emitFlowControl(ctx, statements.slice(first), 0, 'if')
        }
      }
      reportUnconvertedReturn(ctx, statements)
    }
    const { setupStatements, returnExpr } = splitBody(statements)
    return { setup: setupStatements, template: returnExpr ? emitRootJsx(ctx, returnExpr) : [] }
  } finally {
    ctx.helpers = outerHelpers
  }
}

/**
 * A body whose early returns sit where no branch can reach them — inside a
 * loop, a `try`, a `switch`, or an `if` that falls through. Its last return
 * becomes the template and the guards stay behind in `setup`, which is not
 * what the component did.
 */
export function reportUnconvertedReturn(ctx: ConvertContext, statements: readonly ts.Statement[]): void {
  const last = statements.length - 1
  const guard = statements.find(
    (statement, index) => !(index === last && ts.isReturnStatement(statement)) && containsReturn(statement)
  )
  if (guard === undefined) return
  report(
    ctx,
    guard,
    'unconverted-early-return',
    'this early return has no if / else form in the template, so it was left in setup'
  )
}

function firstReturnIndex(statements: readonly ts.Statement[]): number {
  return statements.findIndex(containsReturn)
}

/** A return anywhere but as the last statement: a guard clause. */
export function hasGuardReturns(statements: readonly ts.Statement[]): boolean {
  const last = statements.length - 1
  return statements.some(
    (statement, index) => !(index === last && ts.isReturnStatement(statement)) && containsReturn(statement)
  )
}

/** Whether every path through a statement ends in a `return`. */
function alwaysReturns(statement: ts.Statement): boolean {
  if (ts.isReturnStatement(statement)) return true
  if (ts.isBlock(statement)) return statement.statements.some(alwaysReturns)
  if (ts.isIfStatement(statement)) {
    return (
      statement.elseStatement !== undefined &&
      alwaysReturns(statement.thenStatement) &&
      alwaysReturns(statement.elseStatement)
    )
  }
  return false
}

/**
 * Whether a statement list is shaped like a branch chain the template can
 * express: declarations, then either a `return` or an `if` whose `then` always
 * returns, followed by more of the same. A branch that can fall through into the
 * code after it — or a return inside a loop, a `try`, a `switch` — cannot be
 * written as an `if` without duplicating that code, so it is left alone.
 */
export function canFlow(statements: readonly ts.Statement[]): boolean {
  const first = firstReturnIndex(statements)
  // Code with side effects and nothing rendered after it has no template form.
  if (first < 0) return statements.length === 0
  const statement = statements[first]
  if (ts.isReturnStatement(statement)) return true
  if (!ts.isIfStatement(statement) || !alwaysReturns(statement.thenStatement)) return false
  if (!canFlow(statementsOf(statement.thenStatement))) return false
  if (statement.elseStatement) {
    return alwaysReturns(statement.elseStatement) && canFlow(statementsOf(statement.elseStatement))
  }
  return canFlow(statements.slice(first + 1))
}

/**
 * A branch body: its declarations go into a `scope` block's `setup`, since a
 * branch has no `setup` of its own, and the rest becomes its template.
 */
export function emitScopedFlow(
  ctx: ConvertContext,
  statements: readonly ts.Statement[],
  indent: number,
  prelude: readonly string[] = []
): string[] {
  const first = firstReturnIndex(statements)
  const setup = statements.slice(0, first)
  const rest = statements.slice(first)
  if (setup.length === 0 && prelude.length === 0) return emitFlowControl(ctx, rest, indent, 'if')
  return [
    `${INDENT.repeat(indent)}scope`,
    ...indentLines(renderSetupBlock(ctx, setup, prelude), indent + 1),
    ...branchBody(emitFlowControl(ctx, rest, indent + 1, 'if'), indent + 1)
  ]
}

/**
 * Emits statements starting at a `return` or a guard `if`. The code after a
 * guard is its `else`, and a guard directly followed by another continues the
 * chain as `elseif`. A branch that returns `null` renders nothing, so it is
 * dropped — negating the condition when it was the `if` arm.
 */
function emitFlowControl(
  ctx: ConvertContext,
  statements: readonly ts.Statement[],
  indent: number,
  keyword: 'if' | 'elseif'
): string[] {
  const [statement] = statements
  if (statement === undefined) return []
  const pad = INDENT.repeat(indent)

  if (ts.isReturnStatement(statement)) {
    const returned = statement.expression ? unwrapParens(statement.expression) : null
    if (returned === null || isNullish(returned)) return []
    return emitElementOrExpression(ctx, returned, indent)
  }
  if (!ts.isIfStatement(statement)) return []

  const condition = renderExpr(ctx, statement.expression)
  const otherwise = statement.elseStatement ? statementsOf(statement.elseStatement) : statements.slice(1)
  const whenTrue = branchBody(emitScopedFlow(ctx, statementsOf(statement.thenStatement), indent + 1), indent + 1)
  if (whenTrue.length === 0) {
    const whenFalse = branchBody(emitScopedFlow(ctx, otherwise, indent + 1), indent + 1)
    return whenFalse.length === 0 ? [] : [`${pad}${keyword} !(${condition})`, ...whenFalse]
  }

  const lines = [`${pad}${keyword} ${condition}`, ...whenTrue]
  const [next] = otherwise
  if (next !== undefined && ts.isIfStatement(next) && firstReturnIndex(otherwise) === 0) {
    return [...lines, ...emitFlowControl(ctx, otherwise, indent, 'elseif')]
  }
  const whenFalse = branchBody(emitScopedFlow(ctx, otherwise, indent + 1), indent + 1)
  return whenFalse.length === 0 ? lines : [...lines, `${pad}else`, ...whenFalse]
}
