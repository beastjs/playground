/** The conversion entry point: one pass over the top-level statements, assembled in the order Beast requires. */

import ts from 'typescript'
import { getLeadingLineComments, isDirective, isReferencedElsewhere } from './ast'
import {
  findRootComponentIndex,
  getComponentDeclaration,
  isComponentName,
  renderComponentParts,
  renderFunctionComponent,
  renderMain,
  rootComponentName,
  withoutRootExport
} from './components'
import type { ConvertContext } from './context'
import { renderModuleMember } from './declarations'
import { assertParsed, report, type ConversionDiagnostic } from './diagnostics'
import { collectUnwrappedReact, renderImportDeclaration } from './imports'
import { requoteSource } from './print'
import { collectModuleScope } from './scope'
import { ensureSemicolon, indentLines } from './text'

export interface ConversionResult {
  /** The converted `.btsx` source. */
  code: string
  /**
   * Everything the conversion could not carry over faithfully, in the order it
   * was found. Empty means the output says everything the input did.
   */
  diagnostics: readonly ConversionDiagnostic[]
}

/**
 * Converts TSX source to BTSX, with a report of anything lost on the way.
 *
 * @throws {BtsxConversionError} when the input does not parse as TSX.
 */
export function convertTsx(source: string): ConversionResult {
  const sourceFile = ts.createSourceFile('input.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  assertParsed(sourceFile)
  const moduleScope = collectModuleScope(sourceFile.statements)
  const ctx: ConvertContext = {
    sourceFile,
    sourceText: source,
    reactTypes: new Map(),
    octaneTypeImports: new Map(),
    octaneImports: new Map(),
    moduleScope,
    takenNames: new Set(moduleScope),
    renames: new Map(),
    lifted: [],
    unwrappedReact: collectUnwrappedReact(sourceFile),
    helpers: new Map(),
    asyncComponents: new Set(),
    useName: null,
    diagnostics: []
  }
  const code = convertStatements(ctx)
  return { code, diagnostics: ctx.diagnostics }
}

/**
 * Converts TSX source to BTSX.
 *
 * @throws {BtsxConversionError} when the input does not parse as TSX.
 */
export function convertTsxToBtsx(source: string): string {
  return convertTsx(source).code
}

function convertStatements(ctx: ConvertContext): string {
  const { sourceFile } = ctx
  const statements = sourceFile.statements
  const rootIndex = findRootComponentIndex(statements)
  const rootDeclaration = rootIndex >= 0 ? getComponentDeclaration(statements[rootIndex]) : null
  const rootName = rootDeclaration?.name
  // The file's own component is written as the file's template — `props`,
  // `setup` and markup at column 0 — which Beast compiles to the default export
  // itself. That needs the component's own name to go unused: Beast names the
  // default export after the file, so a reference to the old name (a
  // `Card.displayName`, a parts object built from it) would dangle. Only then
  // does it fall back to a renamed `component` block the template renders, and
  // every reference to it follows the new name.
  const rootInline = rootName !== undefined && !isReferencedElsewhere(sourceFile, rootName)
  if (rootName !== undefined && !rootInline) ctx.renames.set(rootName, rootComponentName(rootName))

  // BTSX is written in one order regardless of the order TSX was written in:
  // every declaration first, then the file's own template. Beast enforces it
  // (BEAST1503_MISPLACED_DECLARATION), and a `const` collecting the exports —
  // the one declaration TSX conventionally puts at the bottom — is exactly what
  // the rule catches. So the sections are gathered separately here and
  // assembled at the end.
  const directive: string[] = []
  const imports: string[] = []
  const moduleMembers: string[] = []
  const components: string[] = []
  const main: string[] = []

  for (let idx = 0; idx < statements.length; idx++) {
    const statement = statements[idx]
    const leadingComments = getLeadingLineComments(ctx, statement)

    if (ts.isImportDeclaration(statement)) {
      imports.push(...leadingComments, ...renderImportDeclaration(ctx, statement))
      continue
    }

    // `function Card(props: A): Element;` above the implementation. A component
    // block has no overloads, so the signature goes and the implementation's
    // own parameter type stands for it.
    if (isComponentOverload(statement, statements)) {
      report(ctx, statement, 'dropped-overload', `the overload signature of ${statement.name.text} was removed`)
      continue
    }

    const component = getComponentDeclaration(statement)
    if (component) {
      const isRoot = idx === rootIndex
      components.push(...leadingComments)
      if (isRoot && rootInline) {
        const parts = renderComponentParts(ctx, component.fn, component.name, component.forwarded)
        components.push(...parts.declarations)
        main.push(...parts.notes, ...parts.body)
        continue
      }
      const name = isRoot ? rootComponentName(component.name) : component.name
      components.push(...renderFunctionComponent(ctx, component.fn, name, component.forwarded))
      if (isRoot) main.push(...renderMain(ctx, component, name))
      continue
    }

    // Beast already exports the file's own component as the default, under the
    // file's name, so an export naming it would export it a second time.
    if (rootName !== undefined) {
      const exported = withoutRootExport(statement, rootName)
      if (exported === null) continue
      if (exported !== statement) {
        moduleMembers.push(...leadingComments, ensureSemicolon(requoteSource(ctx, exported)))
        continue
      }
    }

    // A directive is the one piece of module code that has to precede the
    // imports, exactly as it would in TSRX, or it stops being a directive.
    if (moduleMembers.length === 0 && isDirective(statement)) {
      directive.push(`module ${ensureSemicolon(requoteSource(ctx, statement))}`)
      continue
    }

    // type alias / interface / variable statement / anything else declarative
    moduleMembers.push(...leadingComments, ...renderModuleMember(ctx, statement))
  }

  // Octane's own imports are written last, because what a conversion needs is
  // only known once every annotation and statement has been rendered — a
  // `React.useState` deep in the body pulls in an import of its own. They still
  // belong with the imports the file wrote.
  for (const [module, names] of ctx.octaneImports) {
    imports.push(`import { ${[...names.values()].join(', ')} } from "${module}";`)
  }
  if (ctx.octaneTypeImports.size > 0) {
    imports.push(`import type { ${[...ctx.octaneTypeImports.values()].join(', ')} } from "octane";`)
  }

  const outputLines = [...directive, ...imports]
  if (moduleMembers.length > 0) {
    outputLines.push('module')
    outputLines.push(...indentLines(moduleMembers, 1))
  }
  outputLines.push(...components)
  if (main.length > 0) outputLines.push('', ...main)

  return outputLines.join('\n') + '\n'
}

/** A bodiless `function Name(...)` signature of a component that is implemented below it. */
function isComponentOverload(
  statement: ts.Statement,
  statements: readonly ts.Statement[]
): statement is ts.FunctionDeclaration & { name: ts.Identifier } {
  if (!ts.isFunctionDeclaration(statement) || statement.body !== undefined || statement.name === undefined) return false
  const name = statement.name.text
  if (!isComponentName(name)) return false
  return statements.some(
    (other) => ts.isFunctionDeclaration(other) && other.body !== undefined && other.name?.text === name
  )
}
