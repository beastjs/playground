/** Template block constructs recognised from JSX idioms: `each`, `switch`, `try`, `style`. */

import ts from 'typescript'
import { isJsxLike, statementsOf, unwrapParens } from './ast'
import type { ConvertContext } from './context'
import { report } from './diagnostics'
import { canFlow, emitScopedFlow, hasGuardReturns, renderSetupBlock, reportUnconvertedReturn, splitBody } from './flow'
import { branchBody, emitChildren, emitElementOrExpression, meaningfulChildren, pipeExpression } from './jsx'
import { renderExpr, renderTagName, requoteSource } from './print'
import { freshName } from './scope'
import { INDENT, indentLines, toDoubleQuotedString } from './text'

/**
 * Recognises the immediately-invoked switch React uses to pick between elements:
 * `{(() => { switch (k) { case "a": return <A/>; default: return <D/> } })()}`.
 * Consecutive labels that share a body each get an arm repeating it.
 */
export function emitSwitchBlock(ctx: ConvertContext, expr: ts.Expression, indent: number): string[] | null {
  if (!ts.isCallExpression(expr) || expr.arguments.length !== 0) return null

  const callee = unwrapParens(expr.expression)
  if (!ts.isArrowFunction(callee) && !ts.isFunctionExpression(callee)) return null
  if (!ts.isBlock(callee.body)) return null

  const statements = callee.body.statements
  if (statements.length !== 1) return null
  const [only] = statements
  if (!ts.isSwitchStatement(only)) return null

  const pad = INDENT.repeat(indent)
  const lines = [`${pad}switch ${renderExpr(ctx, only.expression)}`]

  // Labels with no statements fall through to the next clause's body.
  let pendingLabels: string[] = []
  for (const clause of only.caseBlock.clauses) {
    const label = ts.isCaseClause(clause) ? renderExpr(ctx, clause.expression) : null
    if (clause.statements.length === 0) {
      if (label !== null) pendingLabels.push(label)
      continue
    }

    const labels = label === null ? [] : [...pendingLabels, label]
    pendingLabels = []

    const body = emitCaseBody(ctx, clause, indent + 2)

    // Every label gets an arm of its own, repeating a shared body. Beast writes
    // `case "b", "c"` as `@case "b", "c":`, a comma expression that only ever
    // matches "c", and Octane has neither fallthrough nor a label list.
    if (labels.length === 0) lines.push(`${pad}${INDENT}default`, ...body)
    for (const each of labels) lines.push(`${pad}${INDENT}case ${each}`, ...body)
  }

  // A `switch` with no arm carries no meaning; fall back to the generic path.
  return lines.length > 1 ? lines : null
}

/**
 * One arm's template. An arm is a function body in miniature — declarations,
 * guards, a return — so it takes the same path one does, with its declarations
 * in a `scope`. A trailing `break` only ends an arm that returned nothing, and
 * the braces of `case "a": { ... }` only scope its declarations.
 */
function emitCaseBody(ctx: ConvertContext, clause: ts.CaseOrDefaultClause, indent: number): string[] {
  const statements = clause.statements.flatMap(statementsOf)
  if (statements.length > 0 && ts.isBreakStatement(statements[statements.length - 1])) statements.pop()
  let body: string[] = []
  if (canFlow(statements)) {
    body = branchBody(emitScopedFlow(ctx, statements, indent), indent)
  } else {
    report(
      ctx,
      clause,
      'unconverted-switch-case',
      'this switch arm does not end in a return the template can express, so it renders nothing'
    )
  }
  // An arm needs a template node (BEAST1606_EMPTY_SWITCH_ARM), and leaving the
  // arm out would send its label to `default` instead of rendering nothing.
  return body.length > 0 ? body : [`${INDENT.repeat(indent)}| #{null}`]
}

/** Reads a `fallback={...}` prop off a boundary element. */
function getFallback(ctx: ConvertContext, attrs: ts.JsxAttributes): ts.Expression | null {
  for (const attr of attrs.properties) {
    if (!ts.isJsxAttribute(attr)) continue
    if (attr.name.getText(ctx.sourceFile) !== 'fallback') continue
    if (!attr.initializer) return null
    if (ts.isStringLiteral(attr.initializer)) return attr.initializer
    if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
      return attr.initializer.expression
    }
  }
  return null
}

/** Emits a fallback as block content: JSX recurses, anything else is pipe text. */
function emitFallbackBody(ctx: ConvertContext, fallback: ts.Expression, indent: number): string[] {
  const expr = unwrapParens(fallback)
  if (isJsxLike(expr) || ts.isJsxFragment(expr)) return emitElementOrExpression(ctx, expr, indent)
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return [`${INDENT.repeat(indent)}| ${expr.text}`]
  }
  return pipeExpression(renderExpr(ctx, expr), indent)
}

/**
 * `<Suspense>` and `<ErrorBoundary>` become a `try` block with `pending` and
 * `catch` branches. An `ErrorBoundary` wrapping a `Suspense` collapses into one
 * `try` with both branches, which is the shape `beast-tsrx/examples/boundary`
 * uses. A `fallback` written as `(error, reset) => jsx` supplies the `catch`
 * bindings.
 */
export function emitBoundaryBlock(ctx: ConvertContext, node: ts.JsxElement, indent: number): string[] | null {
  const name = renderTagName(ctx, node.openingElement.tagName)
  if (name !== 'Suspense' && name !== 'ErrorBoundary') return null

  const pad = INDENT.repeat(indent)
  let content = meaningfulChildren(node.children)
  let pending: ts.Expression | null = null
  let caught: ts.Expression | null = null
  const boundaries = [node]

  const own = getFallback(ctx, node.openingElement.attributes)
  if (name === 'Suspense') {
    pending = own
  } else {
    caught = own
    // Unwrap a single nested Suspense so both branches land on one `try`.
    if (content.length === 1) {
      const [only] = content
      if (ts.isJsxElement(only) && renderTagName(ctx, only.openingElement.tagName) === 'Suspense') {
        pending = getFallback(ctx, only.openingElement.attributes)
        content = meaningfulChildren(only.children)
        boundaries.push(only)
      }
    }
  }

  if (pending === null && caught === null) return null
  for (const boundary of boundaries) reportDroppedBoundaryProps(ctx, boundary)

  const lines = [`${pad}try`]
  lines.push(...branchBody(emitChildren(ctx, content, indent + 1), indent + 1))

  if (pending !== null) {
    lines.push(`${pad}pending`)
    lines.push(...branchBody(emitFallbackBody(ctx, pending, indent + 1), indent + 1))
  }

  if (caught !== null) {
    const handler = unwrapParens(caught)
    if (ts.isArrowFunction(handler)) {
      const bindings = handler.parameters
        .filter((parameter) => ts.isIdentifier(parameter.name))
        .map((parameter) => parameter.name.getText(ctx.sourceFile))
      lines.push(bindings.length > 0 ? `${pad}catch ${bindings.join(', ')}` : `${pad}catch`)
      const returned = ts.isBlock(handler.body)
        ? (handler.body.statements.find(ts.isReturnStatement)?.expression ?? null)
        : handler.body
      if (returned) lines.push(...branchBody(emitFallbackBody(ctx, returned, indent + 1), indent + 1))
    } else {
      lines.push(`${pad}catch`)
      lines.push(...branchBody(emitFallbackBody(ctx, handler, indent + 1), indent + 1))
    }
  }

  return lines
}

/**
 * A `try` block takes no props, so anything a boundary element carried besides
 * its `fallback` — an `onReset`, a `resetKeys`, a spread — has nowhere to go.
 */
function reportDroppedBoundaryProps(ctx: ConvertContext, node: ts.JsxElement): void {
  const tag = node.openingElement.tagName.getText(ctx.sourceFile)
  for (const attr of node.openingElement.attributes.properties) {
    const name = ts.isJsxAttribute(attr) ? attr.name.getText(ctx.sourceFile) : null
    if (name === 'fallback' || name === 'key') continue
    const described = name === null ? `the spread ${attr.getText(ctx.sourceFile)}` : name
    report(ctx, attr, 'dropped-boundary-prop', `${described} on <${tag}> has no place on a try block and was dropped`)
  }
}

/**
 * `<style>{`...`}</style>` becomes a `style` block carrying raw CSS. The CSS is
 * dedented to its own common indentation first, then re-indented under the
 * block, since indentation is structural in BTSX.
 */
export function emitStyleBlock(ctx: ConvertContext, node: ts.JsxElement, indent: number): string[] | null {
  const children = meaningfulChildren(node.children)
  if (children.length !== 1) return null

  const [child] = children
  let css: string | null = null
  if (ts.isJsxText(child)) css = child.text
  else if (ts.isJsxExpression(child) && child.expression) {
    const expr = child.expression
    if (ts.isNoSubstitutionTemplateLiteral(expr) || ts.isStringLiteral(expr)) css = expr.text
  }
  if (css === null) return null

  const lines = css.replace(/\t/gu, '  ').split('\n')
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length === 0) return null

  const common = lines
    .filter((line) => line.trim() !== '')
    .reduce((min, line) => Math.min(min, line.length - line.trimStart().length), Infinity)
  const dedented = lines.map((line) => (line.trim() === '' ? '' : line.slice(common)))

  return [`${INDENT.repeat(indent)}style`, ...indentLines(dedented, indent + 1)]
}

/**
 * Emits an `each` block. A `key` prop on the iterated element is hoisted onto
 * the `each` line (`each item in list key item.id`) rather than left as an
 * attribute, matching how the key is written by hand.
 */
export function emitIteration(ctx: ConvertContext, expr: ts.Expression, indent: number): string[] | null {
  const info = getMapIterableInfo(ctx, expr)
  if (!info) return null

  const pad = INDENT.repeat(indent)
  const { prelude } = info
  const statements = info.statements ?? []

  // A callback that returns from inside an `if` becomes a branch chain, with
  // its own setup in a `scope`. Its key stays an attribute: it sits on
  // whichever element a branch produces, not on the loop.
  if (hasGuardReturns(statements)) {
    if (canFlow(statements)) {
      return [
        `${pad}each ${info.bindings} in ${info.iterable}`,
        ...branchBody(emitScopedFlow(ctx, statements, indent + 1, prelude), indent + 1)
      ]
    }
    reportUnconvertedReturn(ctx, statements)
  }

  const setup = info.statements !== null ? splitBody(statements).setupStatements : []

  // With a destructured binding the key expression usually references the
  // unpacked names, which are not in scope on the `each` line, so the key stays
  // an attribute (the form `beast-tsrx/examples/card` also uses). The same goes
  // for a key that reads anything the callback declared before returning.
  const keyNode = !info.destructured && info.body ? getKeyExpression(ctx, info.body) : null
  const declaresNothing = setup.length === 0 && prelude.length === 0
  const hoistKey = keyNode !== null && (declaresNothing || readsOnly(keyNode, new Set(info.bindings.split(', '))))
  const keyText = hoistKey && keyNode !== null ? renderKey(ctx, keyNode) : null
  const lines = [`${pad}each ${info.bindings} in ${info.iterable}${keyText ? ` key ${keyText}` : ''}`]
  if (!info.body) return lines

  const omit = keyText ? new Set(['key']) : undefined
  if (prelude.length > 0 || setup.length > 0) {
    lines.push(`${pad}${INDENT}scope`)
    lines.push(...indentLines(renderSetupBlock(ctx, setup, prelude), indent + 2))
    lines.push(...branchBody(emitElementOrExpression(ctx, info.body, indent + 2, omit), indent + 2))
    return lines
  }

  lines.push(...branchBody(emitElementOrExpression(ctx, info.body, indent + 1, omit), indent + 1))
  return lines
}

/** True when every name an expression reads is one of `names`. */
function readsOnly(node: ts.Node, names: ReadonlySet<string>): boolean {
  if (ts.isIdentifier(node)) return names.has(node.text)
  if (ts.isPropertyAccessExpression(node)) return readsOnly(node.expression, names)
  return ts.forEachChild(node, (child) => (readsOnly(child, names) ? undefined : true)) !== true
}

/** Reads a `key={expr}` / `key="str"` prop off the element an `each` produces. */
function getKeyExpression(ctx: ConvertContext, node: ts.Expression): ts.Expression | null {
  let attributes: ts.JsxAttributes | null = null
  if (ts.isJsxElement(node)) attributes = node.openingElement.attributes
  else if (ts.isJsxSelfClosingElement(node)) attributes = node.attributes
  if (!attributes) return null

  for (const attr of attributes.properties) {
    if (!ts.isJsxAttribute(attr)) continue
    if (attr.name.getText(ctx.sourceFile) !== 'key') continue
    if (!attr.initializer) return null
    if (ts.isStringLiteral(attr.initializer)) return attr.initializer
    if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
      return attr.initializer.expression
    }
  }
  return null
}

function renderKey(ctx: ConvertContext, node: ts.Expression): string {
  if (ts.isStringLiteral(node)) return toDoubleQuotedString(node.getText(ctx.sourceFile))
  return renderExpr(ctx, node)
}

interface IterationParts {
  iterable: ts.Expression
  callback: ts.ArrowFunction
}

/**
 * Recognizes the two iteration shapes that map onto an `each` block:
 * `__map_iterable(list, cb)` (the helper the Beast toolchain emits) and a
 * plain `list.map(cb)`.
 */
function getIterationParts(expr: ts.Expression): IterationParts | null {
  if (!ts.isCallExpression(expr)) return null

  const callee = expr.expression

  if (ts.isIdentifier(callee) && callee.text === '__map_iterable' && expr.arguments.length === 2) {
    const [iterable, callback] = expr.arguments
    if (!ts.isArrowFunction(callback)) return null
    return { iterable, callback }
  }

  if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'map' && expr.arguments.length === 1) {
    const [callback] = expr.arguments
    if (!ts.isArrowFunction(callback)) return null
    return { iterable: callee.expression, callback }
  }

  return null
}

export function isIterationCall(expr: ts.Expression): boolean {
  return getIterationParts(expr) !== null
}

interface IterationInfo {
  bindings: string
  iterable: string
  body: ts.Expression | null
  /** The callback's statements, when it has a block body. */
  statements: ts.Statement[] | null
  /** Declarations the loop body needs ahead of its own: unpacked patterns, the array alias. */
  prelude: string[]
  /** Set when a callback parameter was a destructuring pattern. */
  destructured: boolean
}

/** Picks a loop variable name that the callback body does not already use. */
function freshBindingName(
  ctx: ConvertContext,
  callback: ts.ArrowFunction | ts.FunctionExpression,
  taken: ReadonlySet<string>
): string {
  const used = callback.getText(ctx.sourceFile)
  return freshName('item', (name) => taken.has(name) || new RegExp(`\\b${name}\\b`, 'u').test(used))
}

/** A plain name or property path, which reads the same value however often it is evaluated. */
function isStableReference(expr: ts.Expression): boolean {
  if (ts.isIdentifier(expr) || expr.kind === ts.SyntaxKind.ThisKeyword) return true
  return ts.isPropertyAccessExpression(expr) && isStableReference(expr.expression)
}

function getMapIterableInfo(ctx: ConvertContext, expr: ts.Expression): IterationInfo | null {
  const parts = getIterationParts(expr)
  if (!parts) return null
  const { iterable: iterableArg, callback } = parts

  // Beast requires one or two plain identifiers as loop bindings
  // (BEAST1402_INVALID_EACH_BINDING), so a destructuring pattern is bound to a
  // generated name and unpacked inside the body instead.
  const prelude: string[] = []
  const generatedNames = new Set<string>()
  let destructured = false
  const [, , arrayParameter] = callback.parameters
  const params = callback.parameters.slice(0, 2).map((parameter) => {
    if (ts.isIdentifier(parameter.name)) return parameter.name.text
    const generated = freshBindingName(ctx, callback, generatedNames)
    generatedNames.add(generated)
    prelude.push(`const ${requoteSource(ctx, parameter.name)} = ${generated};`)
    destructured = true
    return generated
  })
  const bindings = params.join(', ')
  const iterable = renderExpr(ctx, iterableArg)

  // `.map((item, index, all) => ...)`: the third argument is the array itself,
  // which the loop has no binding for, so the body reads it from the iterable.
  if (arrayParameter !== undefined) {
    if (!isStableReference(unwrapParens(iterableArg))) {
      report(
        ctx,
        arrayParameter,
        'reevaluated-iterable',
        `${arrayParameter.name.getText(ctx.sourceFile)} is re-read from ${iterable} on every iteration`
      )
    }
    prelude.push(`const ${requoteSource(ctx, arrayParameter.name)} = ${iterable};`)
  }

  let body: ts.Expression | null = null
  const statements = ts.isBlock(callback.body) ? [...callback.body.statements] : null
  if (ts.isBlock(callback.body)) {
    for (const stmt of callback.body.statements) {
      if (ts.isReturnStatement(stmt) && stmt.expression) {
        body = unwrapParens(stmt.expression)
      }
    }
  } else {
    body = unwrapParens(callback.body)
  }

  return { bindings, iterable, body, statements, prelude, destructured }
}
