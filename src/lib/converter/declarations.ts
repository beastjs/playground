/** `module`-level declarations — types, interfaces, helpers, constants — and inline type rendering. */

import ts from 'typescript'
import type { ConvertContext } from './context'
import { reindent, renderReactTypeReference, requoteSource } from './print'
import { INDENT, continuationLines, ensureSemicolon } from './text'

export function renderModuleMember(ctx: ConvertContext, statement: ts.Statement): string[] {
  if (ts.isInterfaceDeclaration(statement)) {
    return renderInterface(ctx, statement)
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    // Render the aliased type inline so an object literal type stays on one
    // line, matching how `module` declarations are written by hand.
    const name = statement.name.text
    const params = renderTypeParameters(ctx, statement.typeParameters)
    const head = `type ${name}${params} = `
    // An object type reads like an interface: one member per continuation line.
    if (ts.isTypeLiteralNode(statement.type) && statement.type.members.length > 0) {
      return moduleContinuation(`${head}{`, [...renderTypeMembers(ctx, statement.type.members), '};'])
    }
    const [first, ...rest] = renderTypeInline(ctx, statement.type).split('\n')
    if (rest.length === 0) return [`${head}${ensureSemicolon(first)}`]
    return moduleContinuation(`${head}${first.trimEnd()}`, [
      ...rest.slice(0, -1),
      ensureSemicolon(rest[rest.length - 1].trim())
    ])
  }
  // A plain helper function — anything not named like a component — is declared
  // as written. Its body already ends in `}`, so no semicolon is added.
  if (ts.isFunctionDeclaration(statement)) {
    return reindent(requoteSource(ctx, statement))
  }
  // const/let/var and anything else: print + requote + ensure semicolon.
  const text = requoteSource(ctx, statement)
  return reindent(ensureSemicolon(text))
}

function renderInterface(ctx: ConvertContext, node: ts.InterfaceDeclaration): string[] {
  const params = renderTypeParameters(ctx, node.typeParameters)
  const heritage = node.heritageClauses
    ? ` ${node.heritageClauses.map((clause) => requoteSource(ctx, clause).trim()).join(' ')}`
    : ''
  const head = `interface ${node.name.text}${params}${heritage} {`
  if (node.members.length === 0) return [`${head}}`]
  return moduleContinuation(head, [...renderTypeMembers(ctx, node.members), '}'])
}

function renderTypeParameters(
  ctx: ConvertContext,
  parameters: ts.NodeArray<ts.TypeParameterDeclaration> | undefined
): string {
  return parameters ? `<${parameters.map((t) => requoteSource(ctx, t)).join(', ')}>` : ''
}

/**
 * One line per member of an interface or object type. Property types go through
 * the inline renderer, so a nested object type stays on its member's line — the
 * printer's own multi-line form would break the surrounding indentation, which
 * is structural in BTSX. Methods, index and call signatures are printed as
 * written, collapsed onto their line.
 */
function renderTypeMembers(ctx: ConvertContext, members: ts.NodeArray<ts.TypeElement>): string[] {
  return members.map((member) => {
    if (ts.isPropertySignature(member)) {
      const propName = member.name.getText(ctx.sourceFile)
      const optional = member.questionToken ? '?' : ''
      const readonly = member.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) ? 'readonly ' : ''
      const typeText = member.type ? renderTypeInline(ctx, member.type) : 'unknown'
      return `${readonly}${propName}${optional}: ${typeText};`
    }
    return ensureSemicolon(
      requoteSource(ctx, member)
        .split('\n')
        .map((line) => line.trim())
        .join(' ')
    )
  })
}

/**
 * A declaration inside `module` that spans lines. Beast reads module code line
 * by line, so everything after the first line continues onto `~` lines one level
 * deeper — left bare, a closing brace would land where Beast expects a selector
 * (BEAST1101_INVALID_SELECTOR). Beast rejoins the lines with a single space.
 */
function moduleContinuation(head: string, rest: string[]): string[] {
  return [head, ...continuationLines(rest.join('\n'), INDENT)]
}

/**
 * Renders a type node as a single line, collapsing multi-line object type
 * literals (as the default TS printer/formatter would emit them) into
 * `{ member; member }` form with `;`-separated members. Every member kind is
 * kept — a method or an index signature is as much a part of the type as a
 * property.
 */
export function renderTypeInline(ctx: ConvertContext, typeNode: ts.TypeNode): string {
  // `ReactNode` / `React.ReactNode` (and every other React type Octane restates)
  // becomes its Octane name. Only names this file imported from React qualify,
  // so a local type that happens to share a name with one is left alone.
  if (ts.isTypeReferenceNode(typeNode)) {
    const rendered = renderReactTypeReference(ctx, typeNode.typeName.getText(ctx.sourceFile))
    const args = typeNode.typeArguments
    if (rendered !== null) {
      if (args === undefined) return rendered
      return `${rendered}<${args.map((arg) => renderTypeInline(ctx, arg)).join(', ')}>`
    }
  }
  if (ts.isTypeLiteralNode(typeNode)) {
    const members = renderTypeMembers(ctx, typeNode.members).map((member) => member.slice(0, -1))
    return `{ ${members.join('; ')} }`
  }
  if (ts.isArrayTypeNode(typeNode)) {
    return `${renderTypeInline(ctx, typeNode.elementType)}[]`
  }
  return requoteSource(ctx, typeNode)
}
