/** Import declarations, rewritten onto the Octane modules that provide them. */

import ts from 'typescript'
import { isReactModule, resolveBindingModule, resolveDefaultImport, resolveReactExport, resolveReactType } from '../octane-bindings'
import { countReferences } from './ast'
import { getComponentDeclaration } from './components'
import type { ConvertContext } from './context'
import { addOctaneImport } from './print'
import { quote, stripQuotes } from './text'

/**
 * The React names this conversion rewrites rather than imports. `forwardRef`
 * qualifies only when every reference to it in the file is a call being
 * unwrapped — one left over anywhere else still needs reporting, because the
 * import is going away either way.
 */
export function collectUnwrappedReact(sourceFile: ts.SourceFile): Set<string> {
  const unwrapped = new Set<string>()

  let unwrappedCalls = 0
  for (const statement of sourceFile.statements) {
    if (getComponentDeclaration(statement)?.forwarded) unwrappedCalls += 1
  }
  if (unwrappedCalls > 0 && unwrappedCalls === countReferences(sourceFile, 'forwardRef')) {
    unwrapped.add('forwardRef')
  }
  return unwrapped
}

/**
 * The module-scope names bound to `createContext(...)` from React (or Octane).
 * An Octane context is itself the provider component, with no `.Provider`
 * member, so `<Theme.Provider value>` has to become `<Theme value>` — but only
 * for a context: `Tooltip.Provider` from a UI library is a component of its own.
 */
export function collectContexts(sourceFile: ts.SourceFile): Set<string> {
  // The local names `createContext` is imported under, and the names the
  // module itself goes by (`React.createContext`, `R.createContext`).
  const factories = new Set<string>()
  const namespaces = new Set(['React'])
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue
    const specifier = stripQuotes(statement.moduleSpecifier.getText(sourceFile))
    if (!isReactModule(specifier) && specifier !== 'octane') continue
    const clause = statement.importClause
    if (clause.name) namespaces.add(clause.name.text)
    const bindings = clause.namedBindings
    if (!bindings) continue
    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text)
      continue
    }
    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === 'createContext') factories.add(element.name.text)
    }
  }

  const isFactory = (callee: ts.Expression): boolean =>
    ts.isIdentifier(callee)
      ? factories.has(callee.text)
      : ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'createContext' &&
        ts.isIdentifier(callee.expression) &&
        namespaces.has(callee.expression.text)

  const contexts = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      const init = declaration.initializer
      if (ts.isIdentifier(declaration.name) && init && ts.isCallExpression(init) && isFactory(init.expression)) {
        contexts.add(declaration.name.text)
      }
    }
  }
  return contexts
}

/**
 * Rewrites one import onto the Octane module that actually provides it.
 *
 * A package with an `@octanejs/*` port moves wholesale. React itself is
 * resolved a symbol at a time. Its types all have a home: `octane` re-exports
 * a full React-shaped type surface, so `ComponentProps`, `RefObject`, and the
 * event and attribute families come back as `import type ... from "octane"`,
 * with `ReactNode` renamed to `OctaneNode` here and everywhere it is used. Its
 * values mostly do too, but not `forwardRef`, `Component`, `createRef`, or
 * `cache`, which Octane has no equivalent for by design.
 *
 * Nothing is ever left importing React: a name with no counterpart is dropped
 * and reported in a comment on the line above, so the gap is visible instead of
 * silently emitting an import that cannot resolve.
 *
 * One import can therefore become several statements, so this returns a list.
 */
export function renderImportDeclaration(ctx: ConvertContext, node: ts.ImportDeclaration): string[] {
  const clause = node.importClause
  const specifier = stripQuotes(node.moduleSpecifier.getText(ctx.sourceFile))
  const moduleTarget = resolveBindingModule(specifier) ?? specifier
  const isReact = isReactModule(specifier)

  // `import "./side-effect.css"` has no clause and carries no types to strip.
  if (!clause) return [`import ${quote(moduleTarget)};`]
  // Types still appear in props and setup. Preserve them even though they do
  // not contribute runtime code, including Octane's native signal types.
  const isTypeOnlyClause = clause.phaseModifier === ts.SyntaxKind.TypeKeyword
  // `import defer` is the other phase a clause can carry. It changes when the
  // module is evaluated, so it has to survive the rewrite.
  const phase = isTypeOnlyClause ? 'type ' : clause.phaseModifier === ts.SyntaxKind.DeferKeyword ? 'defer ' : ''

  // A default or namespace import binds the module object itself, so it can
  // only follow a whole-module rewrite, never a per-symbol one.
  const bindings = clause.namedBindings
  const defaultParts: string[] = []
  const groups = new Map<string, string[]>()
  const defaultRewrite = resolveDefaultImport(specifier)
  // A default import re-homed onto another package's named export keeps the
  // local name the file uses, aliasing only when it differs.
  if (clause.name && defaultRewrite && !isReact) {
    const local = clause.name.text
    const { module, name } = defaultRewrite
    addToGroup(groups, module, local === name ? name : `${name} as ${local}`)
  } else if (clause.name && !isReact) {
    defaultParts.push(clause.name.text)
  }
  if (bindings && ts.isNamespaceImport(bindings) && !isReact) {
    defaultParts.push(`* as ${bindings.name.text}`)
  }

  const elements = bindings && ts.isNamedImports(bindings) ? bindings.elements : []
  const dropped: string[] = []

  // Group the named imports by the module each one resolves to, keeping the
  // order they were written in.
  for (const el of elements) {
    const { local, alias } = readImportSpecifier(el)
    const isType = isTypeOnlyClause || el.isTypeOnly

    if (!isReact) {
      const prefix = el.isTypeOnly && !isTypeOnlyClause ? 'type ' : ''
      addToGroup(groups, moduleTarget, prefix + (alias ? `${local} as ${alias}` : local))
      continue
    }

    const octaneType = isType ? resolveReactType(local) : null
    if (isType) {
      if (octaneType === null) {
        dropped.push(local)
        continue
      }
      ctx.reactTypes.set(alias ?? local, {
        render: alias ?? octaneType,
        importText: alias ? `${octaneType} as ${alias}` : octaneType
      })
      continue
    }

    const target = resolveReactExport(specifier, local)
    // `import { ReactNode } from "react"` names a type without saying so.
    const untypedType = target === null ? resolveReactType(local) : null
    if (untypedType !== null) {
      ctx.reactTypes.set(alias ?? local, {
        render: alias ?? untypedType,
        importText: alias ? `${untypedType} as ${alias}` : untypedType
      })
      continue
    }
    if (target === null) {
      // A name the conversion rewrites away is not a gap: `forwardRef` has no
      // Octane equivalent because Octane needs none, and every call to it was
      // unwrapped into a component that takes `ref` as a prop.
      if (!ctx.unwrappedReact.has(local)) dropped.push(local)
      continue
    }
    addOctaneImport(ctx, target, alias ? `${local} as ${alias}` : local)
  }

  const lines: string[] = []
  if (dropped.length > 0) {
    lines.push(`// ${dropped.join(', ')}: no Octane equivalent, dropped from ${specifier}`)
  }
  if (defaultParts.length > 0) {
    const inline = groups.get(moduleTarget)
    if (inline) groups.delete(moduleTarget)
    const parts = [...defaultParts, ...(inline ? [`{ ${inline.join(', ')} }`] : [])]
    lines.push(`import ${phase}${parts.join(', ')} from ${quote(moduleTarget)};`)
  }
  for (const [target, names] of groups) {
    lines.push(`import ${phase}{ ${names.join(', ')} } from ${quote(target)};`)
  }
  return lines
}

function addToGroup(groups: Map<string, string[]>, key: string, name: string): void {
  const group = groups.get(key)
  if (group) group.push(name)
  else groups.set(key, [name])
}

/** The imported name and its local alias, if the specifier renames it. */
function readImportSpecifier(el: ts.ImportSpecifier): { local: string; alias: string | null } {
  // `import { original as local }` resolves by what it renames, not the alias.
  if (el.propertyName) return { local: el.propertyName.text, alias: el.name.text }
  return { local: el.name.text, alias: null }
}
