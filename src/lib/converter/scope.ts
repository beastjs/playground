/** Name resolution: what a function reads from outside itself, and fresh names that collide with nothing. */

import ts from 'typescript'
import { isIntrinsicTag } from './ast'
import type { ConvertContext } from './context'

/** `base`, or `base2`, `base3`, ... — the first one nothing has taken. */
export function freshName(base: string, isTaken: (name: string) => boolean): string {
  let name = base
  let suffix = 2
  while (isTaken(name)) {
    name = `${base}${suffix}`
    suffix += 1
  }
  return name
}

/** A module-scope name nothing in the file already uses, reserved on the way out. */
export function uniqueName(ctx: ConvertContext, base: string): string {
  const name = freshName(base, (candidate) => ctx.takenNames.has(candidate))
  ctx.takenNames.add(name)
  return name
}

/**
 * Names that are always in scope, so a reference to one is never something the
 * enclosing component owns.
 */
const AMBIENT_NAMES: ReadonlySet<string> = new Set([
  'globalThis',
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'console',
  'Math',
  'JSON',
  'Object',
  'Array',
  'String',
  'Number',
  'Boolean',
  'Symbol',
  'BigInt',
  'Date',
  'RegExp',
  'Error',
  'TypeError',
  'Promise',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Intl',
  'URL',
  'URLSearchParams',
  'Infinity',
  'NaN',
  'undefined',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'queueMicrotask',
  'structuredClone',
  'fetch',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURIComponent',
  'decodeURIComponent'
])

/** Every name a binding pattern or identifier introduces. */
function collectBoundNames(name: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(name)) {
    into.add(name.text)
    return
  }
  for (const element of name.elements) {
    if (ts.isOmittedExpression(element)) continue
    collectBoundNames(element.name, into)
  }
}

/** The names a list of statements declares, collected before any is visited. */
function declaredNames(statements: readonly ts.Statement[]): Set<string> {
  const names = new Set<string>()
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBoundNames(declaration.name, names)
      }
      continue
    }
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      names.add(statement.name.text)
    }
  }
  return names
}

/** The names one function's parameters bind. */
function parameterNames(parameters: readonly ts.ParameterDeclaration[]): Set<string> {
  const names = new Set<string>()
  for (const parameter of parameters) collectBoundNames(parameter.name, names)
  return names
}

/**
 * The identifiers a function reads from outside itself — everything that is
 * neither bound within it, nor declared at module scope, nor ambient. Lifting
 * a render prop out of its component turns exactly these into props, because
 * a `component` block is written at module scope and closes over nothing.
 *
 * Only value positions count: a type annotation resolves against the module's
 * own imports, a property name after a `.` is not a reference at all, and a
 * JSX attribute name is markup rather than a read.
 */
export function collectFreeNames(ctx: ConvertContext, fn: ts.ArrowFunction | ts.FunctionExpression): string[] {
  const free: string[] = []
  const seen = new Set<string>()

  const reference = (name: string, bound: ReadonlySet<string>): void => {
    if (bound.has(name) || seen.has(name)) return
    if (ctx.moduleScope.has(name) || AMBIENT_NAMES.has(name)) return
    seen.add(name)
    free.push(name)
  }

  const walk = (node: ts.Node, bound: ReadonlySet<string>): void => {
    // A type never becomes a prop: it resolves where the component is written.
    if (ts.isTypeNode(node) || ts.isTypeParameterDeclaration(node)) return

    if (ts.isIdentifier(node)) {
      reference(node.text, bound)
      return
    }

    if (ts.isPropertyAccessExpression(node)) {
      walk(node.expression, bound)
      return
    }
    if (ts.isQualifiedName(node)) return

    if (ts.isPropertyAssignment(node)) {
      if (ts.isComputedPropertyName(node.name)) walk(node.name.expression, bound)
      walk(node.initializer, bound)
      return
    }
    if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
      const inner = new Set([...bound, ...parameterNames(node.parameters)])
      if (node.body) walk(node.body, inner)
      return
    }
    if (ts.isJsxAttribute(node)) {
      if (node.initializer) walk(node.initializer, bound)
      return
    }
    // `<li>` names an HTML element, not a value in scope; `<Popup>` does name
    // one. The closing tag repeats whichever it was.
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (!isIntrinsicTag(node.tagName)) walk(node.tagName, bound)
      walk(node.attributes, bound)
      return
    }
    if (ts.isJsxClosingElement(node)) return
    if (ts.isBindingElement(node)) {
      // `{ a: b = fallback }` reads `fallback`; `a` and `b` are not reads.
      if (node.initializer) walk(node.initializer, bound)
      if (!ts.isIdentifier(node.name)) walk(node.name, bound)
      return
    }

    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
      const inner = new Set([...bound, ...parameterNames(node.parameters)])
      if (node.name && ts.isIdentifier(node.name)) inner.add(node.name.text)
      for (const parameter of node.parameters) {
        if (parameter.initializer) walk(parameter.initializer, bound)
      }
      if (node.body) walk(node.body, inner)
      return
    }

    if (ts.isBlock(node) || ts.isCaseClause(node) || ts.isDefaultClause(node)) {
      const inner = new Set([...bound, ...declaredNames(node.statements)])
      for (const statement of node.statements) walk(statement, inner)
      return
    }

    if (ts.isVariableDeclaration(node)) {
      // The declared names are already in scope for this statement list; only
      // the initializer and a destructuring default are reads.
      if (!ts.isIdentifier(node.name)) walk(node.name, bound)
      if (node.initializer) walk(node.initializer, bound)
      return
    }

    if (ts.isCatchClause(node)) {
      const inner = new Set(bound)
      if (node.variableDeclaration) collectBoundNames(node.variableDeclaration.name, inner)
      walk(node.block, inner)
      return
    }

    if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      const inner = new Set(bound)
      const initializer = ts.isForStatement(node) ? node.initializer : node.initializer
      if (initializer && ts.isVariableDeclarationList(initializer)) {
        for (const declaration of initializer.declarations) collectBoundNames(declaration.name, inner)
      }
      node.forEachChild((child) => walk(child, inner))
      return
    }

    node.forEachChild((child) => walk(child, bound))
  }

  const bound = new Set(parameterNames(fn.parameters))
  for (const parameter of fn.parameters) {
    if (parameter.initializer) walk(parameter.initializer, new Set())
  }
  walk(fn.body, bound)
  return free
}

/** Every name the file itself declares at module scope, imports included. */
export function collectModuleScope(statements: ts.NodeArray<ts.Statement>): Set<string> {
  const names = new Set<string>()
  for (const statement of statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause
      if (!clause) continue
      if (clause.name) names.add(clause.name.text)
      const bindings = clause.namedBindings
      if (!bindings) continue
      if (ts.isNamespaceImport(bindings)) names.add(bindings.name.text)
      else for (const element of bindings.elements) names.add(element.name.text)
      continue
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBoundNames(declaration.name, names)
      }
      continue
    }
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text)
    }
  }
  return names
}

/** A name for a generated component that nothing in the file already uses. */
export function uniqueComponentName(ctx: ConvertContext, base: string): string {
  const cleaned = base.replace(/[^A-Za-z0-9]/gu, '') || 'Render'
  return uniqueName(ctx, `${cleaned}Children`)
}

/** A parameter name for the call site that collides with nothing it mentions. */
export function freshParameterName(taken: ReadonlySet<string>): string {
  return freshName('state', (candidate) => taken.has(candidate))
}
