/** Lifting JSX-returning helpers and render props into their own `component` blocks. */

import ts from 'typescript'
import { isJsxLike, unwrapParens } from './ast'
import { propsLines, returnsJsx } from './components'
import type { ConvertContext, LiftedHelper } from './context'
import { renderTypeInline } from './declarations'
import { report } from './diagnostics'
import { canFlow, hasGuardReturns, renderBody, renderSetupBlock } from './flow'
import { buildTagLines } from './jsx'
import { octaneCreateElement, renderExpr, requoteSource } from './print'
import { collectFreeNames, freshParameterName, uniqueComponentName, uniqueName } from './scope'
import { indentLines } from './text'

/**
 * Lifts the helpers a body declares to render markup — `const renderValue =
 * (value, path) => <span/>` — into `component` blocks, returning the statements
 * that stay behind. Left in `setup`, a helper's JSX is never converted at all.
 *
 * A helper qualifies when its parameters are plain names and every use of it is
 * a call in a position the template renders: a JSX child, a branch of a
 * conditional there, or a return the template is built from. Those calls become
 * elements, its arguments become props named after the parameters, and anything
 * it read from the component around it is passed along the way a lifted render
 * prop's captures are. Any other use — passing it as a value, calling it from a
 * handler — needs the function itself, so the helper stays.
 */
export function liftHelpers(ctx: ConvertContext, body: ts.Block): ts.Statement[] {
  const candidates = new Map<
    string,
    { statement: ts.VariableStatement; declarationName: ts.Identifier; fn: ts.ArrowFunction | ts.FunctionExpression }
  >()
  for (const statement of body.statements) {
    if (!ts.isVariableStatement(statement)) continue
    const declarations = statement.declarationList.declarations
    if (declarations.length !== 1) continue
    const [declaration] = declarations
    if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
    const fn = unwrapParens(declaration.initializer)
    if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) continue
    if (!fn.parameters.every((parameter) => ts.isIdentifier(parameter.name) && !parameter.dotDotDotToken)) continue
    if (!returnsJsxAnywhere(fn)) continue
    // A guard the template cannot express would lose its branches.
    if (ts.isBlock(fn.body) && hasGuardReturns(fn.body.statements) && !canFlow(fn.body.statements)) continue
    candidates.set(declaration.name.text, { statement, declarationName: declaration.name, fn })
  }
  if (candidates.size === 0) return [...body.statements]

  const owners = new Set<ts.Node>([body.parent, ...[...candidates.values()].map(({ fn }) => fn)])
  for (const [name, { declarationName, fn }] of candidates) {
    if (!allUsesMountable(body, name, declarationName, fn.parameters.length, owners)) candidates.delete(name)
  }
  if (candidates.size === 0) return [...body.statements]

  // Register every helper before rendering any, so they can mount each other
  // and themselves.
  const lifted = [...candidates].map(([name, { fn }]) => {
    const captures = collectFreeNames(ctx, fn).filter((free) => !candidates.has(free))
    const helper: LiftedHelper = {
      component: uniqueName(ctx, name.charAt(0).toUpperCase() + name.slice(1)),
      params: fn.parameters.map((parameter) => parameter.name.getText(ctx.sourceFile)),
      captures
    }
    ctx.helpers.set(name, helper)
    return { name, fn, helper }
  })

  for (const { name, fn, helper } of lifted) {
    const bindings = fn.parameters.map((parameter) => {
      const own = parameter.name.getText(ctx.sourceFile)
      return parameter.initializer ? `${own} = ${renderExpr(ctx, parameter.initializer)}` : own
    })
    bindings.push(...helper.captures)

    // The parameters' own annotations make the props type, as long as nothing
    // was captured: those types live in the component this was lifted out of.
    const typed = helper.captures.length === 0 && fn.parameters.every((parameter) => parameter.type)
    const annotation = typed
      ? `: { ${fn.parameters
          .map((parameter) => {
            const optional = parameter.initializer || parameter.questionToken ? '?' : ''
            return `${parameter.name.getText(ctx.sourceFile)}${optional}: ${renderTypeInline(ctx, parameter.type as ts.TypeNode)}`
          })
          .join('; ')} }`
      : ''

    pushLiftedComponent(ctx, {
      component: helper.component,
      origin: `the ${name} helper`,
      fn,
      bindings,
      annotation,
      captures: helper.captures
    })
  }

  const liftedStatements = new Set<ts.Statement>([...candidates.values()].map(({ statement }) => statement))
  return body.statements.filter((statement) => !liftedStatements.has(statement))
}

/**
 * Renders a lifted function as a `component` block, queued to be declared ahead
 * of the component it came from, under a note saying where it came from.
 */
function pushLiftedComponent(
  ctx: ConvertContext,
  lifted: {
    component: string
    /** `the renderRow helper`, `the Root render prop`. */
    origin: string
    fn: ts.ArrowFunction | ts.FunctionExpression
    /** The props pattern's members: the function's own parameters, then its captures. */
    bindings: string[]
    /** `: { ... }`, or empty when the props could not be typed. */
    annotation: string
    captures: string[]
  }
): void {
  const { component, origin, fn, bindings, annotation, captures } = lifted
  const body: string[] = []
  if (bindings.length > 0) body.push(...propsLines(`{ ${bindings.join(', ')} }${annotation}`))
  const { setup, template } = renderBody(ctx, fn.body)
  body.push(...renderSetupBlock(ctx, setup), ...template)

  const notes = [
    captures.length > 0
      ? `// lifted from ${origin}; ${captures.join(', ')} came from the component around it`
      : `// lifted from ${origin}`
  ]
  if (bindings.length > 0 && annotation === '') {
    notes.push('// its props type is the one thing the conversion cannot infer — annotate it')
    report(ctx, fn, 'untyped-props', `${component}, lifted from ${origin}, has untyped props`)
  }
  ctx.lifted.push([...notes, `component ${component}`, ...indentLines(body, 1)])
}

/** Whether a function returns JSX from anywhere in its body. */
function returnsJsxAnywhere(fn: ts.ArrowFunction | ts.FunctionExpression): boolean {
  if (!ts.isBlock(fn.body)) return isJsxLike(unwrapParens(fn.body))
  const visit = (node: ts.Node): boolean => {
    if (ts.isReturnStatement(node)) return node.expression !== undefined && isJsxLike(unwrapParens(node.expression))
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return false
    return ts.forEachChild(node, (child) => (visit(child) ? true : undefined)) === true
  }
  return visit(fn.body)
}

/** Whether every use of a helper is a call the template can mount as an element. */
function allUsesMountable(
  root: ts.Node,
  name: string,
  declarationName: ts.Identifier,
  arity: number,
  owners: ReadonlySet<ts.Node>
): boolean {
  let mountable = true
  const walk = (node: ts.Node): void => {
    if (!mountable) return
    if (ts.isIdentifier(node) && node.text === name && node !== declarationName) {
      const parent = node.parent
      const isMemberName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node)
      if (!isMemberName && !isMountableCall(node, arity, owners)) mountable = false
    }
    node.forEachChild(walk)
  }
  walk(root)
  return mountable
}

function isMountableCall(identifier: ts.Identifier, arity: number, owners: ReadonlySet<ts.Node>): boolean {
  const call = identifier.parent
  if (!ts.isCallExpression(call) || call.expression !== identifier) return false
  if (call.arguments.length > arity || call.arguments.some(ts.isSpreadElement)) return false

  let node: ts.Node = call
  while (
    ts.isParenthesizedExpression(node.parent) ||
    (ts.isConditionalExpression(node.parent) && node.parent.condition !== node)
  ) {
    node = node.parent
  }
  const parent = node.parent
  if (ts.isJsxExpression(parent)) return ts.isJsxElement(parent.parent) || ts.isJsxFragment(parent.parent)
  if (ts.isReturnStatement(parent)) {
    let fn: ts.Node = parent
    while (!ts.isFunctionLike(fn)) fn = fn.parent
    return owners.has(fn)
  }
  if (ts.isArrowFunction(parent) && parent.body === node) return owners.has(parent)
  return false
}

/** A call to a lifted helper, if the expression is one. */
export function getHelperCall(
  ctx: ConvertContext,
  expr: ts.Expression
): { call: ts.CallExpression; helper: LiftedHelper } | null {
  const call = unwrapParens(expr)
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return null
  const helper = ctx.helpers.get(call.expression.text)
  return helper ? { call, helper } : null
}

/** Mounts a lifted helper where it was called: arguments become props. */
export function emitHelperCall(ctx: ConvertContext, expr: ts.Expression, indent: number): string[] | null {
  const found = getHelperCall(ctx, expr)
  if (found === null) return null
  const { call, helper } = found
  const rest = call.arguments.map((argument, index) => `${helper.params[index]}={${renderExpr(ctx, argument)}}`)
  rest.push(...helper.captures.map((capture) => `${capture}={${capture}}`))
  return buildTagLines(helper.component, false, { className: null, id: null, rest }, indent)
}

/**
 * Lifts a JSX-returning render prop into its own `component` block, and returns
 * the `children={...}` attribute that calls it.
 *
 * The block is written at module scope, so everything the function read from
 * the component around it — props, `setup` values — becomes a prop, passed
 * explicitly at the call site. Calling the generated component as a function
 * rather than mounting it as an element keeps the original semantics: the
 * render prop ran inline in whatever rendered it, and so does this.
 *
 * Returns null when the shape is not liftable, which leaves the function to be
 * hoisted into `setup` instead.
 */
export function liftRenderProp(ctx: ConvertContext, tag: string, fn: ts.ArrowFunction | ts.FunctionExpression): string | null {
  if (!returnsJsx(fn)) return null
  if (fn.parameters.length > 1) return null

  const [parameter] = fn.parameters
  const isPattern = parameter !== undefined && ts.isObjectBindingPattern(parameter.name)
  const isIdentifier = parameter !== undefined && ts.isIdentifier(parameter.name)
  if (parameter !== undefined && !isPattern && !isIdentifier) return null

  const captures = collectFreeNames(ctx, fn)
  const name = uniqueComponentName(ctx, tag)

  // The generated component's own parameter: what the render prop destructured,
  // widened with the names it used to close over.
  const bindings: string[] = []
  if (parameter && isPattern) {
    const pattern = requoteSource(ctx, parameter.name).trim()
    const inner = pattern.slice(1, -1).trim()
    if (inner.length > 0) bindings.push(inner)
  } else if (parameter && isIdentifier) {
    bindings.push(parameter.name.getText(ctx.sourceFile))
  }
  bindings.push(...captures)

  // The parameter's own annotation carries over when nothing was captured. Once
  // captures widen the parameter there is no type left to write: their types
  // live in the component this was lifted out of, which is not in scope here.
  const annotation =
    parameter && parameter.type && captures.length === 0 ? `: ${renderTypeInline(ctx, parameter.type)}` : ''

  pushLiftedComponent(ctx, { component: name, origin: `the ${tag} render prop`, fn, bindings, annotation, captures })

  // A destructuring render prop that captured nothing is already shaped like a
  // component: the state object it unpacks *is* the props object.
  // The element has to be *created*, never called. A compiled component takes
  // the runtime's own arguments beside its props, so invoking it directly from
  // the render prop leaves those undefined and it dies reading its block.
  const create = octaneCreateElement(ctx)

  if (parameter && isIdentifier) {
    const argument = parameter.name.getText(ctx.sourceFile)
    return `children={(${argument}) => ${create}(${name}, { ${[argument, ...captures].join(', ')} })}`
  }
  if (parameter && isPattern) {
    const argument = freshParameterName(new Set([...captures, ...ctx.takenNames]))
    // A destructuring render prop that captured nothing is already shaped like
    // a component: the state object it unpacks is the props object.
    const props = captures.length === 0 ? argument : `{ ...${argument}, ${captures.join(', ')} }`
    return `children={(${argument}) => ${create}(${name}, ${props})}`
  }
  if (captures.length === 0) return `children={() => ${create}(${name}, {})}`
  return `children={() => ${create}(${name}, { ${captures.join(', ')} })}`
}
