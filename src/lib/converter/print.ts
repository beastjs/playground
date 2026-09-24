/** Printing TypeScript nodes as BTSX-shaped source, and recording the Octane imports that printing needs. */

import ts from 'typescript'
import { resolveReactExport, resolveReactType } from '../octane-bindings'
import { unwrapParens } from './ast'
import type { ConvertContext } from './context'
import { report } from './diagnostics'
import { uniqueName } from './scope'
import { INDENT } from './text'

/**
 * Printers hold no per-file state between `printNode` calls, so one of each
 * serves every conversion.
 */
const SOURCE_PRINTER = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })

/**
 * Printer for expressions that end up inside an attribute or a `#{...}`
 * interpolation. Those are joined back into a single logical line, so a
 * `// ...` comment would swallow whatever followed it — this printer drops
 * comments instead.
 */
const EXPRESSION_PRINTER = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true })

/**
 * Prints a node as BTSX-shaped source: single-quoted string literals become
 * double-quoted, any React type the file imported is renamed to the Octane
 * name it was imported under (`ReactNode` -> `OctaneNode`), `React.useState`
 * loses its namespace, and the file's renamed component follows its new name.
 */
export function requoteSource(ctx: ConvertContext, node: ts.Node): string {
  return printRewritten(ctx, SOURCE_PRINTER, node)
}

/** The same, for an expression that has to survive being joined onto one line. */
export function renderExpr(ctx: ConvertContext, expr: ts.Expression): string {
  return printRewritten(ctx, EXPRESSION_PRINTER, expr)
}

/**
 * The element name as BTSX writes it. `<React.Suspense>` resolves the same way
 * a `React.` reference in an expression does, so namespaced JSX lands on the
 * Octane component instead of a React namespace that is no longer imported.
 */
export function renderTagName(ctx: ConvertContext, node: ts.JsxTagNameExpression): string {
  if (ts.isIdentifier(node)) return ctx.renames.get(node.text) ?? node.text
  return printRewritten(ctx, EXPRESSION_PRINTER, node)
}

/**
 * Every rewrite happens on the tree rather than in the printed text: text has
 * no way to tell a string from the apostrophe in `// it's` or in JSX text, nor
 * a reference to `Card` from the word "Card" in a label, and rewriting those
 * corrupts the output.
 */
function printRewritten(ctx: ConvertContext, printer: ts.Printer, node: ts.Node): string {
  // Most nodes a conversion prints — a condition, a handler, a type — have
  // nothing to rewrite, and printing them as they are skips building a
  // transformation for each one.
  if (!needsRewrite(ctx, node)) return printer.printNode(ts.EmitHint.Unspecified, node, ctx.sourceFile)

  const result = ts.transform(node, [
    (context) => {
      const visit = (child: ts.Node): ts.Node =>
        rewriteNode(ctx, child, visit) ?? ts.visitEachChild(child, visit, context)
      return (root) => visit(root)
    }
  ])
  try {
    const [printed] = result.transformed
    // A node the transform rebuilt prints the comments before it, which an
    // untouched node never does, and the callers already emit the leading line
    // comment themselves — it came out twice.
    // A rebuilt string literal already carries its own flag, and has no comments.
    if (printed !== node && !ts.isStringLiteral(printed)) ts.setEmitFlags(printed, ts.EmitFlags.NoLeadingComments)
    return printer.printNode(ts.EmitHint.Unspecified, printed, ctx.sourceFile)
  } finally {
    result.dispose()
  }
}

/** Whether anything under a node is one of the things `rewriteNode` replaces. */
function needsRewrite(ctx: ConvertContext, node: ts.Node): boolean {
  if (ts.isStringLiteral(node)) return true
  if (isComponentAwait(ctx, node)) return true
  if (ts.isIdentifier(node)) {
    return node.text === 'React' || ctx.renames.has(node.text) || ctx.reactTypes.has(node.text)
  }
  if (isContextProvider(ctx, node)) return true
  return ts.forEachChild(node, (child) => (needsRewrite(ctx, child) ? true : undefined)) === true
}

/** The replacement for one node, or undefined to keep it and visit its children. */
function rewriteNode(ctx: ConvertContext, node: ts.Node, visit: (node: ts.Node) => ts.Node): ts.Node | undefined {
  // `(await highlighter).codeToTokens(...)`: the call `use()` becomes needs no
  // parentheses of its own, except as the target of `new`.
  if (
    ts.isParenthesizedExpression(node) &&
    isComponentAwait(ctx, node.expression) &&
    !(node.parent && ts.isNewExpression(node.parent))
  ) {
    return rewriteNode(ctx, node.expression, visit)
  }
  if (isComponentAwait(ctx, node)) return renderUseCall(ctx, node, visit)

  // A new literal is escaped to ASCII unless told otherwise; `"▼"` would come
  // out as `"▼"`.
  if (ts.isStringLiteral(node)) {
    return ts.setEmitFlags(ts.factory.createStringLiteral(node.text, false), ts.EmitFlags.NoAsciiEscaping)
  }

  // `{ Card }` names both the key and the value; only the value is renamed, or
  // every `Parts.Card` in the app stops resolving.
  if (ts.isShorthandPropertyAssignment(node) && node.objectAssignmentInitializer === undefined) {
    const renamed = ctx.renames.get(node.name.text)
    if (renamed !== undefined) {
      return ts.factory.createPropertyAssignment(node.name.text, ts.factory.createIdentifier(renamed))
    }
  }

  // `Theme.Provider` is `Theme`: an Octane context is its own provider.
  if (isContextProvider(ctx, node)) return visit(node.expression)

  if (ts.isPropertyAccessExpression(node) || ts.isQualifiedName(node)) {
    const left = ts.isPropertyAccessExpression(node) ? node.expression : node.left
    const right = ts.isPropertyAccessExpression(node) ? node.name : node.right
    if (ts.isIdentifier(left) && left.text === 'React' && ts.isIdentifier(right)) {
      const resolved = resolveQualifiedReact(ctx, right.text, node)
      if (resolved !== null) return ts.factory.createIdentifier(resolved)
    }
    return undefined
  }

  if (ts.isIdentifier(node) && isReference(node)) {
    const renamed = ctx.renames.get(node.text)
    if (renamed !== undefined) return ts.factory.createIdentifier(renamed)
    // A type is only imported from `octane` if it is referenced, so the
    // substitution is also what records the need for the import.
    const reactType = ctx.reactTypes.get(node.text)
    if (reactType !== undefined) {
      ctx.octaneTypeImports.set(reactType.render, reactType.importText)
      if (reactType.render !== node.text) return ts.factory.createIdentifier(reactType.render)
    }
  }
  return undefined
}

/** `Theme.Provider`, where `Theme` is a context the file creates. */
function isContextProvider(
  ctx: ConvertContext,
  node: ts.Node
): node is ts.PropertyAccessExpression & { expression: ts.Identifier } {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'Provider' &&
    ts.isIdentifier(node.expression) &&
    ctx.contexts.has(node.expression.text)
  )
}

/**
 * An `await` that belongs to an async component's own body, rather than to a
 * function nested inside it. Octane components are synchronous: a component
 * suspends on a promise by reading it with `use()` under `Suspense`
 * (`beast-tsrx/examples/async`), which is what the `await` becomes.
 */
function isComponentAwait(ctx: ConvertContext, node: ts.Node): node is ts.AwaitExpression {
  if (!ts.isAwaitExpression(node) || ctx.asyncComponents.size === 0) return false
  let current: ts.Node | undefined = node.parent
  while (current !== undefined && !ts.isFunctionLike(current)) current = current.parent
  return current !== undefined && ctx.asyncComponents.has(current)
}

/**
 * `use(promise)`, recording the import it needs. `use()` suspends until the
 * promise settles and then renders again, reading the promise anew: one made
 * during render is a new promise every time and never settles in time, so
 * anything but a reference to an existing one is reported.
 */
function renderUseCall(ctx: ConvertContext, node: ts.AwaitExpression, visit: (node: ts.Node) => ts.Node): ts.Node {
  if (ctx.useName === null) {
    // A file that already imported React's `use` has it rewritten onto Octane's.
    const imported = [...(ctx.octaneImports.get('octane')?.keys() ?? [])].find(
      (text) => text === 'use' || text.startsWith('use as ')
    )
    if (imported !== undefined) {
      ctx.useName = imported === 'use' ? 'use' : imported.slice('use as '.length)
    } else {
      ctx.useName = uniqueName(ctx, 'use')
      addOctaneImport(ctx, 'octane', ctx.useName === 'use' ? 'use' : `use as ${ctx.useName}`)
    }
  }
  if (!isStableReference(node.expression)) {
    report(
      ctx,
      node,
      'uncached-use-promise',
      'an await in an async component became use() on a promise created during render; create it outside the component so it is the same promise on every render'
    )
  }
  const operand = visit(node.expression) as ts.Expression
  return ts.factory.createCallExpression(ts.factory.createIdentifier(ctx.useName), undefined, [operand])
}

/** `highlighter`, `props.data`, `cache[key]`: a read of a promise, not the making of one. */
function isStableReference(expr: ts.Expression): boolean {
  const inner = unwrapParens(expr)
  if (ts.isIdentifier(inner) || inner.kind === ts.SyntaxKind.ThisKeyword) return true
  if (ts.isPropertyAccessExpression(inner)) return isStableReference(inner.expression)
  if (ts.isElementAccessExpression(inner)) return isStableReference(inner.expression)
  if (ts.isNonNullExpression(inner) || ts.isAsExpression(inner)) return isStableReference(inner.expression)
  return false
}

/**
 * Whether an identifier refers to a binding, as opposed to naming a property,
 * a member, an attribute or the declaration it belongs to.
 */
function isReference(node: ts.Identifier): boolean {
  const parent = node.parent as ts.Node | undefined
  if (parent === undefined) return true
  if (ts.isPropertyAccessExpression(parent)) return parent.expression === node
  if (ts.isQualifiedName(parent)) return parent.left === node
  if (ts.isShorthandPropertyAssignment(parent)) return false
  const named = parent as ts.Node & { name?: ts.Node; propertyName?: ts.Node }
  return named.name !== node && named.propertyName !== node
}

/**
 * `React.Something`. Code pasted out of a React codebase reaches React through
 * the namespace rather than a named import, so there is nothing in the import
 * list to key off — the qualified name is the only evidence, and it is enough.
 * Values and types both resolve: `React.useState` becomes `useState`,
 * `React.ComponentProps` becomes `ComponentProps`, and each records the import
 * it needs. A name with neither is left as written, and reported.
 */
function resolveQualifiedReact(ctx: ConvertContext, name: string, node: ts.Node): string | null {
  const value = resolveReactExport('react', name)
  if (value !== null) {
    addOctaneImport(ctx, value, name)
    return name
  }
  const octane = resolveReactType(name)
  if (octane !== null) {
    ctx.octaneTypeImports.set(octane, octane)
    return octane
  }
  report(ctx, node, 'unresolved-react-member', `React.${name} has no Octane equivalent and still refers to React`)
  return null
}

/**
 * Splits printed statements into lines and rewrites the TypeScript printer's
 * four-space body indentation to the two-space `INDENT` the rest of the output
 * uses, so a multi-line declaration nested in a `module` block lines up with
 * everything around it.
 *
 * A line that starts inside a template literal is part of the string's value,
 * not indentation, and is kept exactly as written. Beast strips only the block
 * indent it adds itself, so `sql`/`css` template content comes out unchanged.
 */
export function reindent(text: string): string[] {
  const verbatim = templateLiteralRanges(text)
  let offset = 0
  return text.split('\n').map((line) => {
    const start = offset
    offset += line.length + 1
    if (verbatim.some(([from, to]) => from < start && start < to)) return line
    const body = line.trimStart()
    if (body.length === 0) return ''
    const depth = (line.length - body.length) / 4
    if (!Number.isInteger(depth)) return line
    return INDENT.repeat(depth) + body
  })
}

/** Where the literal text of every template literal in printed source starts and ends. */
function templateLiteralRanges(text: string): [number, number][] {
  // Only a template literal can hold a line break that is not indentation.
  if (!text.includes('`') || !text.includes('\n')) return []
  const file = ts.createSourceFile('printed.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const ranges: [number, number][] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      ranges.push([node.getStart(file), node.end])
      return
    }
    node.forEachChild(visit)
  }
  visit(file)
  return ranges
}

/** `createElement`, recording the import it needs from Octane. */
export function octaneCreateElement(ctx: ConvertContext): string {
  const module = resolveReactExport('react', 'createElement')
  if (module === null) return 'createElement'
  addOctaneImport(ctx, module, 'createElement')
  return 'createElement'
}

/** `Ref<T>`, recording the import it needs from Octane. */
export function octaneRefType(ctx: ConvertContext, element: string): string {
  const octane = resolveReactType('Ref')
  if (octane === null) return `unknown`
  ctx.octaneTypeImports.set(octane, octane)
  return `${octane}<${element}>`
}

/** Records one value import the conversion resolved onto an Octane module. */
export function addOctaneImport(ctx: ConvertContext, module: string, text: string): void {
  const names = ctx.octaneImports.get(module)
  if (names) names.set(text, text)
  else ctx.octaneImports.set(module, new Map([[text, text]]))
}

/**
 * The Octane rendering of a React type reference, recording the import it
 * needs, or null when the name is not a React type this file imported.
 */
export function renderReactTypeReference(ctx: ConvertContext, name: string): string | null {
  const imported = ctx.reactTypes.get(name)
  if (imported) {
    ctx.octaneTypeImports.set(imported.render, imported.importText)
    return imported.render
  }
  // `React.ReactNode` reaches the type through the default import, which the
  // conversion drops, so the name has to be imported on its own.
  if (!name.startsWith('React.')) return null
  const octane = resolveReactType(name.slice('React.'.length))
  if (octane === null) return null
  ctx.octaneTypeImports.set(octane, octane)
  return octane
}
