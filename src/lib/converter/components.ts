/** Finding the components in a file and rendering them as `component` blocks or the file's own template. */

import ts from 'typescript'
import { hasDefaultExport, isJsxLike, unwrapParens } from './ast'
import type { ConvertContext } from './context'
import { renderTypeInline } from './declarations'
import { report } from './diagnostics'
import { renderBody, renderSetupBlock } from './flow'
import { octaneRefType, requoteSource } from './print'
import { INDENT, continuationLines, indentLines } from './text'

type ComponentFn = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression

/** A `forwardRef(...)` call the conversion unwraps into a plain component. */
interface ForwardedRef {
  fn: ts.ArrowFunction | ts.FunctionExpression
  /** The second parameter, which becomes the `ref` prop. */
  refParameter: ts.ParameterDeclaration
  /** `forwardRef<HTMLElement, Props>`: the element type, then the props type. */
  typeArguments: ts.NodeArray<ts.TypeNode> | undefined
}

interface ComponentDeclaration {
  name: string
  fn: ComponentFn
  forwarded?: ForwardedRef
}

/**
 * JSX resolves a lowercase tag to an HTML element, so only a capitalized name
 * can ever be used as a component. A `useGroupContext` or a `formatLabel` is a
 * plain function that happens to live beside the components, and belongs in
 * `module` as written.
 */
export function isComponentName(name: string): boolean {
  return /^[A-Z]/u.test(name)
}

/**
 * Detects the top-level declarations that become `component` blocks:
 * `function Foo() { ... }`, `const Foo = (props) => <jsx/>` and
 * `const Foo = function () { ... }`. A function has to be named like a
 * component, and an initializer has to actually return JSX — everything else
 * stays an ordinary `module` declaration.
 */
export function getComponentDeclaration(statement: ts.Statement): ComponentDeclaration | null {
  if (ts.isFunctionDeclaration(statement)) {
    // A signature without a body — an overload, a `declare` — renders nothing.
    if (statement.body === undefined) return null
    // A default-exported component may be anonymous, in which case there is no
    // name to judge and the export itself says it is the file's component.
    const name = statement.name ? statement.name.text : 'Anonymous'
    if (statement.name && !isComponentName(name)) return null
    return { name, fn: statement }
  }

  // `export default forwardRef(...)`: the file's own component, written as the
  // wrapper's return value rather than as a declaration.
  if (ts.isExportAssignment(statement)) {
    if (statement.isExportEquals) return null
    const forwarded = getForwardRefCall(statement.expression)
    if (!forwarded) return null
    const inner = forwarded.fn
    const name = ts.isFunctionExpression(inner) && inner.name ? inner.name.text : 'Anonymous'
    return { name, fn: inner, forwarded }
  }

  if (!ts.isVariableStatement(statement)) return null
  const declarations = statement.declarationList.declarations
  if (declarations.length !== 1) return null

  const [declaration] = declarations
  if (!ts.isIdentifier(declaration.name)) return null
  if (!isComponentName(declaration.name.text)) return null

  const init = declaration.initializer
  if (!init) return null

  const forwarded = getForwardRefCall(init)
  if (forwarded) return { name: declaration.name.text, fn: forwarded.fn, forwarded }

  if (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init)) return null
  if (!returnsJsx(init)) return null

  return { name: declaration.name.text, fn: init }
}

/**
 * `forwardRef((props, ref) => jsx)` — the wrapper Octane has no equivalent for,
 * because a ref is an ordinary prop there and nothing needs forwarding
 * (`beast-tsrx/examples/refs`). The call is unwrapped: the function inside is
 * the component, and its second parameter rejoins the first as a `ref` prop.
 */
function getForwardRefCall(expression: ts.Expression): ForwardedRef | null {
  const call = unwrapParens(expression)
  if (!ts.isCallExpression(call) || call.arguments.length !== 1) return null

  const callee = call.expression
  const isForwardRef = ts.isIdentifier(callee)
    ? callee.text === 'forwardRef'
    : ts.isPropertyAccessExpression(callee) && callee.name.text === 'forwardRef'
  if (!isForwardRef) return null

  const [fn] = call.arguments
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return null
  if (fn.parameters.length !== 2) return null

  const [, refParameter] = fn.parameters
  if (!ts.isIdentifier(refParameter.name)) return null

  return { fn, refParameter, typeArguments: call.typeArguments }
}

export function returnsJsx(fn: ts.ArrowFunction | ts.FunctionExpression): boolean {
  if (!ts.isBlock(fn.body)) return isJsxLike(unwrapParens(fn.body))
  return fn.body.statements.some(
    (stmt) => ts.isReturnStatement(stmt) && stmt.expression !== undefined && isJsxLike(unwrapParens(stmt.expression))
  )
}

/**
 * Picks the file's own component: the one Beast exports as the default, named
 * after the file. The default export says so outright. Without one, the file's
 * component is the one every other component is named after — `DropdownMenu`
 * in a file of `DropdownMenuTrigger`, `DropdownMenuItem` and the rest, which is
 * what `dropdown-menu.btsx` is called. A file with neither has no main.
 */
export function findRootComponentIndex(statements: ts.NodeArray<ts.Statement>): number {
  const named: { index: number; name: string }[] = []

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i]
    const declaration = getComponentDeclaration(statement)
    if (!declaration) continue
    if (hasDefaultExport(statement)) return i
    named.push({ index: i, name: declaration.name })
  }

  const prefix = named.find(({ name }) => named.every((other) => other.name.startsWith(name)))
  return prefix ? prefix.index : -1
}

/**
 * Beast gives the file's default export the file's own name, so the component
 * behind it cannot keep that name: it becomes `NameRoot`, and the file's
 * template renders it.
 */
export function rootComponentName(name: string): string {
  return `${name}Root`
}

/**
 * The file's template: its `props`, spread whole into the root component. The
 * type is the root component's own, so the default export accepts exactly what
 * the component does.
 */
export function renderMain(ctx: ConvertContext, component: ComponentDeclaration, name: string): string[] {
  let type: string | null = null
  if (component.forwarded) {
    const refName = component.forwarded.refParameter.name.getText(ctx.sourceFile)
    type = renderForwardedPropsType(ctx, component.forwarded, refName)
  } else {
    const [parameter] = component.fn.parameters
    if (parameter === undefined) return [name]
    if (parameter.type) type = renderTypeInline(ctx, parameter.type)
  }
  // A plain `props` parameter rather than `{...props}`: when a long type makes
  // Beast wrap the parameter, it writes `{ ...props, }`, and a rest element
  // with a trailing comma is a syntax error Octane rejects.
  const header = type === null ? 'props' : `props: ${type}`
  return [...propsLines(header), `${name}({...props})`]
}

/**
 * An export statement with the file's own component taken out of it: the same
 * statement when it does not name the component, a narrower one when it names
 * others too, and null when nothing is left to export.
 */
export function withoutRootExport(statement: ts.Statement, rootName: string): ts.Statement | null {
  if (ts.isExportAssignment(statement)) {
    const { expression } = statement
    return ts.isIdentifier(expression) && expression.text === rootName ? null : statement
  }
  if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier) return statement
  const clause = statement.exportClause
  if (!clause || !ts.isNamedExports(clause)) return statement

  const kept = clause.elements.filter((element) => (element.propertyName ?? element.name).getText() !== rootName)
  if (kept.length === clause.elements.length) return statement
  if (kept.length === 0) return null
  return ts.factory.updateExportDeclaration(
    statement,
    statement.modifiers,
    statement.isTypeOnly,
    ts.factory.updateNamedExports(clause, kept),
    statement.moduleSpecifier,
    statement.attributes
  )
}

export function renderFunctionComponent(
  ctx: ConvertContext,
  fn: ComponentFn,
  name: string,
  forwarded?: ForwardedRef
): string[] {
  if (fn.body === undefined) return []
  const { declarations, notes, body } = renderComponentParts(ctx, fn, name, forwarded)

  // Every component other than the file's own is a named `component` block
  // with its props nested inside it.
  return [...declarations, ...notes, `component ${name}`, ...indentLines(body, 1)]
}

/**
 * A component's `props`, `setup` and template, unindented, plus the blocks
 * lifted out of it (which have to be declared ahead of it) and any notes about
 * it. The caller decides whether they form a `component` block or the file's
 * own template.
 */
export function renderComponentParts(
  ctx: ConvertContext,
  fn: ComponentFn,
  name: string,
  forwarded?: ForwardedRef
): { declarations: string[]; notes: string[]; body: string[] } {
  if (fn.body === undefined) return { declarations: [], notes: [], body: [] }

  const rootParam = forwarded ? null : getRootPropsParam(fn)

  const body: string[] = []
  const notes: string[] = []
  if (rootParam) body.push(...propsLines(renderRootPropsHeader(ctx, rootParam)))
  if (forwarded) {
    const header = renderForwardedPropsHeader(ctx, forwarded)
    body.push(...propsLines(header.text))
    if (!header.typed) {
      notes.push(`// ${name} forwarded a ref; give its props a type that includes ref`)
      report(ctx, forwarded.fn, 'untyped-props', `${name} forwarded a ref without a props type`)
    }
  }
  // Rendering the template is what lifts render props and helpers out of it, so
  // the blocks they became are only known now. They are declarations, and every
  // declaration has to precede the first template line
  // (BEAST1503_MISPLACED_DECLARATION), so they go out ahead of this component.
  const { setup, template } = renderBody(ctx, fn.body)
  body.push(...renderSetupBlock(ctx, setup), ...template)
  const declarations = ctx.lifted.splice(0, ctx.lifted.length).flat()
  return { declarations, notes, body }
}

/**
 * The `props` declaration for a header. A type that printed across several
 * lines (an intersection with an object literal, say) continues onto `~` lines
 * one level deeper; left as bare lines, they would read as over-indented
 * template (BEAST1002_UNEXPECTED_INDENT).
 */
export function propsLines(header: string): string[] {
  const [first, ...rest] = header.split('\n')
  return [`props ${first.trimEnd()}`, ...continuationLines(rest.join('\n'), INDENT)]
}

/**
 * The `props` line for an unwrapped `forwardRef`. The two parameters become
 * one: the ref joins the props it was separated from, ahead of any rest
 * element, which has to stay last to be a valid binding pattern — and ahead of
 * it is also where it belongs, since `forwardRef` kept the ref out of the rest.
 */
function renderForwardedPropsHeader(ctx: ConvertContext, forwarded: ForwardedRef): { text: string; typed: boolean } {
  const refName = forwarded.refParameter.name.getText(ctx.sourceFile)
  const [propsParameter] = forwarded.fn.parameters

  const bindings: string[] = []
  let rest: string | null = null
  if (ts.isObjectBindingPattern(propsParameter.name)) {
    for (const element of propsParameter.name.elements) {
      const text = requoteSource(ctx, element)
      if (element.dotDotDotToken) rest = text
      else bindings.push(text)
    }
  } else {
    // A whole-object parameter keeps working as one: the ref is named out of it
    // and everything else rests back into the name the body already uses.
    rest = `...${propsParameter.name.getText(ctx.sourceFile)}`
  }
  bindings.push(refName)
  if (rest !== null) bindings.push(rest)

  const pattern = `{ ${bindings.join(', ')} }`
  const annotation = renderForwardedPropsType(ctx, forwarded, refName)
  if (annotation === null) return { text: pattern, typed: false }
  return { text: `${pattern}: ${annotation}`, typed: true }
}

/**
 * `forwardRef<HTMLElement, Props>` states both halves of the type it needs:
 * the props, and what the ref points at. Without the type arguments the
 * parameters' own annotations are the next best source, and with neither there
 * is nothing to write.
 */
function renderForwardedPropsType(ctx: ConvertContext, forwarded: ForwardedRef, refName: string): string | null {
  const args = forwarded.typeArguments
  if (args && args.length === 2) {
    const element = renderTypeInline(ctx, args[0])
    const props = renderTypeInline(ctx, args[1])
    return `${props} & { ${refName}: ${octaneRefType(ctx, element)} }`
  }

  const [propsParameter] = forwarded.fn.parameters
  if (!propsParameter.type) return null
  const props = renderTypeInline(ctx, propsParameter.type)
  const ref = forwarded.refParameter.type
    ? renderTypeInline(ctx, forwarded.refParameter.type)
    : octaneRefType(ctx, 'unknown')
  return `${props} & { ${refName}: ${ref} }`
}

/** A "root" component is one whose single parameter is `{ ...destructured }: SomeType`. */
function getRootPropsParam(fn: ComponentFn): ts.ParameterDeclaration | null {
  if (fn.parameters.length !== 1) return null
  const [param] = fn.parameters
  if (!ts.isObjectBindingPattern(param.name)) return null
  if (!param.type) return null
  return param
}

function renderRootPropsHeader(ctx: ConvertContext, param: ts.ParameterDeclaration): string {
  const pattern = requoteSource(ctx, param.name)
  const type = param.type ? renderTypeInline(ctx, param.type) : 'unknown'
  return `${pattern}: ${type}`
}
