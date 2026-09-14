/** The JSX -> BTSX template emitter: elements, attributes, children and conditionals. */

import ts from 'typescript'
import { isHtmlTagName, isJsxLike, isNullish, unwrapParens } from './ast'
import { emitBoundaryBlock, emitIteration, emitStyleBlock, emitSwitchBlock, isIterationCall } from './blocks'
import type { ConvertContext } from './context'
import { emitHelperCall, getHelperCall, liftRenderProp } from './lift'
import { renderExpr, renderTagName } from './print'
import { INDENT, continuationLines, decodeEntities, indentLines, normalizeJsxText, toDoubleQuotedString } from './text'

/**
 * A component whose root is an explicit `<>...</>` emits a `fragment` block.
 * Multiple roots are legal without it, but keeping the author's fragment makes
 * the grouping explicit — and a `style` block needs something to sit beside.
 */
export function emitRootJsx(ctx: ConvertContext, expr: ts.Expression): string[] {
  const root = unwrapParens(expr)
  if (ts.isJsxFragment(root)) {
    const children = meaningfulChildren(root.children)
    if (children.length > 1) return ['fragment', ...emitChildren(ctx, children, 1)]
  }
  return emitJsxNode(ctx, expr, 0)
}

/** Entry point: emit a returned expression, which is typically a JSX element possibly wrapped in parens. */
function emitJsxNode(ctx: ConvertContext, expr: ts.Expression, indent: number): string[] {
  const unwrapped = unwrapParens(expr)
  return emitElementOrExpression(ctx, unwrapped, indent)
}

export function emitElementOrExpression(
  ctx: ConvertContext,
  node: ts.Expression,
  indent: number,
  omit?: ReadonlySet<string>
): string[] {
  if (ts.isJsxElement(node)) return emitJsxElement(ctx, node, indent, omit)
  if (ts.isJsxSelfClosingElement(node)) return emitSelfClosing(ctx, node, indent, omit)
  if (ts.isJsxFragment(node)) return emitChildren(ctx, meaningfulChildren(node.children), indent)
  // A branch of a conditional or the body of a loop can itself be a block
  // construct — `cond ? list.map(...) : other.map(...)` — so it takes the same
  // path an expression child does. Anything else falls through to pipe text,
  // since an unprefixed `#{...}` line parses as an id selector and Beast
  // rejects it with BEAST1101_INVALID_SELECTOR.
  return emitJsxExpressionChild(ctx, node, indent)
}

interface AttrInfo {
  className: { kind: 'shorthand'; value: string } | { kind: 'raw'; text: string } | null
  /** Static `id="foo"` on an HTML tag, rendered as the `#foo` selector shorthand. */
  id: string | null
  rest: string[] // rendered "name={expr}" / 'name="str"' pairs, in original order
}

/** `#foo` shorthand only works for ids that are valid selector fragments. */
function isSelectorSafe(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)
}

function collectAttrs(
  ctx: ConvertContext,
  attrs: ts.JsxAttributes,
  isHtml: boolean,
  omit?: ReadonlySet<string>
): AttrInfo {
  const rest: string[] = []
  let className: AttrInfo['className'] = null
  let id: string | null = null
  // A selector shorthand always renders before the attribute list, so hoisting
  // a `className`/`id` that the source wrote *after* a spread would silently
  // flip which one wins. Once a spread is seen, keep them as plain attributes.
  let seenSpread = false

  for (const attr of attrs.properties) {
    if (ts.isJsxSpreadAttribute(attr)) {
      rest.push(`{...${renderExpr(ctx, attr.expression)}}`)
      seenSpread = true
      continue
    }
    if (!ts.isJsxAttribute(attr)) continue
    const attrName = attr.name.getText(ctx.sourceFile)
    // `key` is hoisted onto the enclosing `each` line, so drop it here.
    if (omit && omit.has(attrName)) continue
    const rendered = renderAttrValue(ctx, attr)

    if (!seenSpread && isHtml && attrName === 'id' && attr.initializer && ts.isStringLiteral(attr.initializer)) {
      if (isSelectorSafe(attr.initializer.text)) {
        id = attr.initializer.text
        continue
      }
    }

    if (!seenSpread && isHtml && attrName === 'className' && attr.initializer && ts.isStringLiteral(attr.initializer)) {
      const value = attr.initializer.text
      // The selector grammar accepts a narrow charset. Tailwind values such as
      // `sm:px-2`, `bg-black/40` or `w-[calc(100%-1rem)]` are rejected outright,
      // and a dotted value like `p-2.5` is worse — it parses as two classes
      // (`p-2` and `5`). Anything outside the charset stays a plain attribute.
      if (isSelectorSafe(value)) {
        className = { kind: 'shorthand', value }
        continue
      }
      className = { kind: 'raw', text: rendered }
      continue
    }

    rest.push(rendered)
  }

  return { className, id, rest }
}

function renderAttrValue(ctx: ConvertContext, attr: ts.JsxAttribute): string {
  const name = attr.name.getText(ctx.sourceFile)
  if (!attr.initializer) return name // boolean attribute shorthand
  if (ts.isStringLiteral(attr.initializer)) {
    return `${name}=${toDoubleQuotedString(attr.initializer.getText(ctx.sourceFile))}`
  }
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    return `${name}={${renderExpr(ctx, attr.initializer.expression)}}`
  }
  return name
}

/**
 * Beyond this width a tag's attribute list is broken across `~` continuation
 * lines instead of being emitted as one very long line.
 */
const MAX_TAG_LINE = 100

/** Builds the `tag#id.class` selector, collapsing an implicit `div`. */
function buildSelector(name: string, isHtml: boolean, attrs: AttrInfo): string {
  if (!isHtml) return name

  const id = attrs.id ? `#${attrs.id}` : ''
  const cls = attrs.className && attrs.className.kind === 'shorthand' ? `.${attrs.className.value}` : ''

  // `div` is the implicit tag, so `div#foo.bar` writes as `#foo.bar` — but a
  // bare `div` with no selector still needs its name.
  const base = name === 'div' && (id || cls) ? '' : name
  return `${base}${id}${cls}`
}

/**
 * Renders a tag line. Returns multiple lines when the attribute list is long
 * enough to warrant `~` continuations, which is why callers take a string[].
 */
export function buildTagLines(name: string, isHtml: boolean, attrs: AttrInfo, indent: number): string[] {
  const selector = buildSelector(name, isHtml, attrs)

  const rest = [...attrs.rest]
  if (isHtml && attrs.className && attrs.className.kind === 'raw') {
    // Non-shorthand className kept as a regular attribute (fallback path).
    rest.unshift(attrs.className.text)
  }

  const pad = INDENT.repeat(indent)
  if (rest.length === 0) return [`${pad}${selector}`]

  // An attribute whose value printed across several lines — an event handler
  // with a block body, a render prop — has no single-line form to fall back to:
  // every one of its lines has to become a continuation, or the tail lands in
  // the template as markup and the attribute list is never closed
  // (BEAST1201_UNCLOSED_ATTRIBUTES).
  const spansLines = rest.some((attr) => attr.includes('\n'))
  const singleLine = `${pad}${selector}(${rest.join(' ')})`
  if (!spansLines && (singleLine.length <= MAX_TAG_LINE || rest.length < 2)) return [singleLine]

  const contPad = INDENT.repeat(indent + 1)
  const lines = [`${pad}${selector}(`]
  for (const attr of rest) lines.push(...continuationLines(attr, contPad))
  lines.push(`${contPad}~ )`)
  return lines
}

/**
 * Makes the lines of a control-flow body — an `if` arm, an `each` body, a `try`
 * branch — valid TSRX. Those bodies compile to statement blocks (`@if (a) {
 * ... }`), where Octane reads bare text as JavaScript: `| Failed.` becomes a
 * syntax error, and so does any text with a space or an apostrophe. Text there
 * is written as a string expression instead. A body may also hold only one JSX
 * root ("Adjacent JSX elements must be wrapped"), so several are grouped in a
 * `fragment`.
 */
export function branchBody(lines: string[], indent: number): string[] {
  const pad = INDENT.repeat(indent)
  const isTopLevel = (line: string) => line.startsWith(pad) && line.length > pad.length && line[pad.length] !== ' '
  const body = lines.map((line) => {
    if (!isTopLevel(line)) return line
    const text = line.slice(pad.length)
    if (!text.startsWith('| ') || text.startsWith('| #{')) return line
    return `${pad}| #{${JSON.stringify(decodeEntities(text.slice(2)))}}`
  })
  const roots = body.filter((line) => isTopLevel(line) && !line.slice(pad.length).startsWith('~')).length
  if (roots <= 1) return body
  return [`${pad}fragment`, ...indentLines(body, 1)]
}

/**
 * Emits `| #{expr}` pipe text, continuing onto `~` lines when the expression
 * printed across several of them.
 */
export function pipeExpression(text: string, indent: number): string[] {
  const pad = INDENT.repeat(indent)
  const [first, ...rest] = text.split('\n')
  if (rest.length === 0) return [`${pad}| #{${text}}`]
  return [
    `${pad}| #{${first.trim()}`,
    ...continuationLines(rest.join('\n'), INDENT.repeat(indent + 1)),
    `${INDENT.repeat(indent + 1)}~ }`
  ]
}

function emitSelfClosing(
  ctx: ConvertContext,
  node: ts.JsxSelfClosingElement,
  indent: number,
  omit?: ReadonlySet<string>
): string[] {
  const name = renderTagName(ctx, node.tagName)
  const isHtml = isHtmlTagName(name)
  const attrs = collectAttrs(ctx, node.attributes, isHtml, omit)
  return buildTagLines(name, isHtml, attrs, indent)
}

function emitJsxElement(
  ctx: ConvertContext,
  node: ts.JsxElement,
  indent: number,
  omit?: ReadonlySet<string>
): string[] {
  const name = renderTagName(ctx, node.openingElement.tagName)

  if (name === 'style') {
    const styleBlock = emitStyleBlock(ctx, node, indent)
    if (styleBlock !== null) return styleBlock
  }

  const boundary = emitBoundaryBlock(ctx, node, indent)
  if (boundary !== null) return boundary

  const isHtml = isHtmlTagName(name)
  const attrs = collectAttrs(ctx, node.openingElement.attributes, isHtml, omit)

  const meaningful = meaningfulChildren(node.children)

  // A render prop is the child the template cannot own: the element calls it,
  // with arguments only it has. It goes back to being what it already is — the
  // `children` prop — written last so it keeps winning over any spread, the
  // same precedence JSX children have.
  const render = getRenderPropChild(meaningful)
  if (render) {
    attrs.rest.push(renderPropAttribute(ctx, name, render))
    return buildTagLines(name, isHtml, attrs, indent)
  }

  const tagLines = buildTagLines(name, isHtml, attrs, indent)
  if (meaningful.length === 0) return tagLines

  // Once the attribute list is split across `~` continuation lines there is no
  // "end of the tag line" left to append to, so content becomes a child line.
  const canInline = tagLines.length === 1
  const head = tagLines[0]

  if (canInline) {
    // Inline case: a single "simple" expression child.
    if (meaningful.length === 1 && isSimpleExprChild(ctx, meaningful[0])) {
      const exprText = renderExpr(ctx, (meaningful[0] as ts.JsxExpression).expression as ts.Expression)
      return [`${head} #{${exprText}}`]
    }

    // Inline case: a single plain-text child (no expressions at all).
    if (meaningful.length === 1 && ts.isJsxText(meaningful[0])) {
      return [`${head} ${normalizeJsxText((meaningful[0] as ts.JsxText).text)}`]
    }

    // Inline case: text mixed with simple expressions, no element children.
    if (isInlineTextRun(ctx, meaningful)) {
      const inline = renderInlineTextRun(ctx, meaningful)
      return [`${head}${inline.length > 0 ? ' ' + inline : ''}`]
    }
  }

  return [...tagLines, ...emitChildren(ctx, meaningful, indent + 1)]
}

/**
 * `<Root>{(state) => <jsx/>}</Root>`: children given as a function the element
 * invokes itself. BTSX has no block form for one — a block is a subtree, and
 * this is a callback whose parameters only exist inside the call — so the
 * function stays a TypeScript expression, which is where a render prop is
 * least surprising anyway.
 */
function getRenderPropChild(children: ts.JsxChild[]): ts.ArrowFunction | ts.FunctionExpression | null {
  if (children.length !== 1) return null
  const [only] = children
  if (!ts.isJsxExpression(only) || !only.expression) return null
  const expr = unwrapParens(only.expression)
  if (!ts.isArrowFunction(expr) && !ts.isFunctionExpression(expr)) return null
  return expr
}

/**
 * The `children` attribute a render prop becomes. One that returns JSX is
 * lifted into a `component` block so its markup is converted like any other;
 * one that returns anything else — a string, a number, an element the caller
 * built — has no template to lift and stays the expression it was.
 */
function renderPropAttribute(ctx: ConvertContext, tag: string, fn: ts.ArrowFunction | ts.FunctionExpression): string {
  const lifted = liftRenderProp(ctx, tag, fn)
  if (lifted !== null) return lifted
  return `children={${renderExpr(ctx, fn)}}`
}

export function meaningfulChildren(children: ts.NodeArray<ts.JsxChild>): ts.JsxChild[] {
  return children.filter((child) => {
    if (ts.isJsxText(child)) {
      return normalizeJsxText(child.text).length > 0
    }
    return true
  })
}

function isSimpleExprChild(ctx: ConvertContext, child: ts.JsxChild, inTextRun = false): boolean {
  if (!ts.isJsxExpression(child) || !child.expression) return false
  const expr = child.expression
  if (getHelperCall(ctx, expr) !== null) return false
  // Among text, a ternary picking between values stays interpolated: splitting
  // it into branches would split the text around it onto separate lines, and
  // the spaces between them are lost (`3 item#{s}` renders as `3items`).
  if (ts.isConditionalExpression(expr)) return inTextRun && !containsMarkup(ctx, expr)
  if (isIterationCall(expr)) return false
  if (getLogicalGuard(expr) !== null) return false
  if (isSwitchIife(expr)) return false
  return true
}

/** Whether an expression holds JSX, or a call the template mounts as an element. */
function containsMarkup(ctx: ConvertContext, node: ts.Node): boolean {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true
  if (ts.isExpression(node) && getHelperCall(ctx, node) !== null) return true
  return ts.forEachChild(node, (child) => (containsMarkup(ctx, child) ? true : undefined)) === true
}

function isSwitchIife(expr: ts.Expression): boolean {
  if (!ts.isCallExpression(expr) || expr.arguments.length !== 0) return false
  const callee = unwrapParens(expr.expression)
  if (!ts.isArrowFunction(callee) && !ts.isFunctionExpression(callee)) return false
  if (!ts.isBlock(callee.body)) return false
  return callee.body.statements.length === 1 && ts.isSwitchStatement(callee.body.statements[0])
}

function isInlineTextRun(ctx: ConvertContext, children: ts.JsxChild[]): boolean {
  const hasElement = children.some((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxFragment(c))
  if (hasElement) return false
  const exprChildren = children.filter((c) => ts.isJsxExpression(c))
  if (exprChildren.length === 0) return false // pure text single child already handled elsewhere / trivial
  const hasText = children.some((c) => ts.isJsxText(c))
  // Every expression child (if more than one) must be simple; block constructs force the block layout.
  return exprChildren.every((c) => isSimpleExprChild(ctx, c, hasText))
}

function renderInlineTextRun(ctx: ConvertContext, children: ts.JsxChild[]): string {
  let out = ''
  for (const child of children) {
    if (ts.isJsxText(child)) {
      out += normalizeJsxText(child.text)
    } else if (ts.isJsxExpression(child) && child.expression) {
      out += `#{${renderExpr(ctx, child.expression)}}`
    }
  }
  return out.trim()
}

/** Emit a list of sibling children, each becoming one or more indented lines. */
export function emitChildren(ctx: ConvertContext, children: ts.JsxChild[], indent: number): string[] {
  const pad = INDENT.repeat(indent)
  const lines: string[] = []
  for (const child of children) {
    if (ts.isJsxText(child)) {
      const text = normalizeJsxText(child.text)
      if (text.length > 0) lines.push(`${pad}| ${text}`)
      continue
    }
    if (ts.isJsxElement(child)) {
      lines.push(...emitJsxElement(ctx, child, indent))
      continue
    }
    if (ts.isJsxSelfClosingElement(child)) {
      lines.push(...emitSelfClosing(ctx, child, indent))
      continue
    }
    if (ts.isJsxFragment(child)) {
      lines.push(...emitChildren(ctx, meaningfulChildren(child.children).slice(), indent))
      continue
    }
    if (ts.isJsxExpression(child) && child.expression) {
      lines.push(...emitJsxExpressionChild(ctx, child.expression, indent))
      continue
    }
  }
  return lines
}

function emitJsxExpressionChild(ctx: ConvertContext, expr: ts.Expression, indent: number): string[] {
  const pad = INDENT.repeat(indent)

  if (ts.isConditionalExpression(expr)) return emitConditional(ctx, expr, indent, 'if')

  // `{cond && <X/>}` is an `if` with no `else` branch.
  const guard = getLogicalGuard(expr)
  if (guard) {
    return [
      `${pad}if ${renderExpr(ctx, guard.condition)}`,
      ...branchBody(emitElementOrExpression(ctx, guard.body, indent + 1), indent + 1)
    ]
  }

  const switchBlock = emitSwitchBlock(ctx, expr, indent)
  if (switchBlock !== null) return switchBlock

  const iteration = emitIteration(ctx, expr, indent)
  if (iteration) return iteration

  const helper = emitHelperCall(ctx, expr, indent)
  if (helper) return helper

  // Plain expression sibling among other children.
  return pipeExpression(renderExpr(ctx, expr), indent)
}

/**
 * Emits an `if` / `elseif` / `else` chain. A ternary whose false branch is
 * another ternary continues the chain rather than nesting a fresh `if`, which
 * is what the `elseif` keyword exists for.
 */
function emitConditional(
  ctx: ConvertContext,
  expr: ts.ConditionalExpression,
  indent: number,
  keyword: 'if' | 'elseif'
): string[] {
  const pad = INDENT.repeat(indent)

  // `cond ? undefined : <A/>` is a one-armed `if` written inside out — the
  // branch that renders is the false one, so the condition is negated and the
  // empty arm disappears rather than becoming a line that renders nothing.
  const whenTrue = unwrapParens(expr.whenTrue)
  const whenFalse = unwrapParens(expr.whenFalse)
  if (isNullish(whenTrue) && !isNullish(whenFalse)) {
    return [
      `${pad}${keyword} !(${renderExpr(ctx, expr.condition)})`,
      ...branchBody(emitElementOrExpression(ctx, whenFalse, indent + 1), indent + 1)
    ]
  }

  const lines: string[] = [`${pad}${keyword} ${renderExpr(ctx, expr.condition)}`]
  lines.push(...branchBody(emitElementOrExpression(ctx, whenTrue, indent + 1), indent + 1))

  const otherwise = whenFalse
  if (ts.isConditionalExpression(otherwise)) {
    lines.push(...emitConditional(ctx, otherwise, indent, 'elseif'))
    return lines
  }

  // `cond ? <A/> : null` has no meaningful else branch to emit.
  if (isNullish(otherwise)) return lines

  lines.push(`${pad}else`)
  lines.push(...branchBody(emitElementOrExpression(ctx, otherwise, indent + 1), indent + 1))
  return lines
}

/** Matches `cond && <jsx/>`, the guard form React uses in place of a one-armed if. */
function getLogicalGuard(expr: ts.Expression): { condition: ts.Expression; body: ts.Expression } | null {
  if (!ts.isBinaryExpression(expr)) return null
  if (expr.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return null
  const body = unwrapParens(expr.right)
  if (!isJsxLike(body)) return null
  return { condition: expr.left, body }
}
