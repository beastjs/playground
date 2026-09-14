/** Small, stateless questions asked of the TypeScript AST. */

import ts from 'typescript'
import type { ConvertContext } from './context'

/** How many times a name is used outside the imports that bind it. */
export function countReferences(sourceFile: ts.SourceFile, name: string): number {
  let count = 0
  const walk = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name) count += 1
    node.forEachChild(walk)
  }
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) continue
    walk(statement)
  }
  return count
}

/** `"use client"` and friends: a string literal standing alone as a statement. */
export function isDirective(statement: ts.Statement): boolean {
  return ts.isExpressionStatement(statement) && ts.isStringLiteralLike(statement.expression)
}

/**
 * The `// ...` comment lines immediately preceding a statement, exactly as
 * written. A comment runs over as many consecutive lines as it takes, so the
 * whole run is kept; a blank line ends it, and whatever sits above the blank
 * belongs to something else.
 */
export function getLeadingLineComments(ctx: ConvertContext, node: ts.Node): string[] {
  const ranges = ts.getLeadingCommentRanges(ctx.sourceText, node.getFullStart())
  if (!ranges) return []
  let first = ranges.length
  while (first > 0) {
    const range = ranges[first - 1]
    if (range.kind !== ts.SyntaxKind.SingleLineCommentTrivia) break
    const next = ranges[first]
    if (next !== undefined && ctx.sourceText.slice(range.end, next.pos).split('\n').length > 2) break
    first -= 1
  }
  return ranges.slice(first).map((range) => ctx.sourceText.slice(range.pos, range.end))
}

export function endsWithBlock(statement: ts.Statement): boolean {
  return (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isIfStatement(statement) ||
    ts.isForStatement(statement) ||
    ts.isForOfStatement(statement) ||
    ts.isForInStatement(statement) ||
    ts.isWhileStatement(statement) ||
    ts.isTryStatement(statement) ||
    ts.isSwitchStatement(statement) ||
    ts.isBlock(statement)
  )
}

export function isJsxLike(expr: ts.Expression): boolean {
  return ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr)
}

export function hasDefaultExport(statement: ts.Statement): boolean {
  if (ts.isExportAssignment(statement)) return !statement.isExportEquals
  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false
}

/**
 * Whether a name is used anywhere but in its own declaration and the export
 * statements naming it, which the conversion drops for the file's component.
 */
export function isReferencedElsewhere(sourceFile: ts.SourceFile, name: string): boolean {
  const isOwnDeclaration = (node: ts.Identifier): boolean => {
    const parent = node.parent
    if (
      (ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent) || ts.isVariableDeclaration(parent)) &&
      parent.name === node
    ) {
      return true
    }
    if (ts.isExportAssignment(parent) && parent.expression === node) return true
    if (ts.isExportSpecifier(parent)) return true
    return (ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)) && parent.name === node
  }
  const visit = (node: ts.Node): boolean => {
    if (ts.isIdentifier(node) && node.text === name && !isOwnDeclaration(node)) return true
    return ts.forEachChild(node, (child) => (visit(child) ? true : undefined)) === true
  }
  return sourceFile.statements.some((statement) => !ts.isImportDeclaration(statement) && visit(statement))
}

/**
 * Guard analysis asks this of the same statements over and over — once per
 * nesting level of an `if` chain — so the answer is kept per node. The tree is
 * never mutated, so it cannot go stale.
 */
const returnCache = new WeakMap<ts.Node, boolean>()

/** Whether a node returns, not counting the functions nested inside it. */
export function containsReturn(node: ts.Node): boolean {
  if (ts.isReturnStatement(node)) return true
  if (ts.isFunctionLike(node) || ts.isClassLike(node)) return false
  const cached = returnCache.get(node)
  if (cached !== undefined) return cached
  const result = ts.forEachChild(node, (child) => (containsReturn(child) ? true : undefined)) === true
  returnCache.set(node, result)
  return result
}

export function statementsOf(statement: ts.Statement): ts.Statement[] {
  return ts.isBlock(statement) ? [...statement.statements] : [statement]
}

/** True for `<div>` / `<path>` — a tag the runtime resolves, not a reference. */
export function isIntrinsicTag(tagName: ts.JsxTagNameExpression): boolean {
  return ts.isIdentifier(tagName) && isHtmlTagName(tagName.text)
}

export function unwrapParens(expr: ts.Expression): ts.Expression {
  let current = expr
  while (ts.isParenthesizedExpression(current)) current = current.expression
  return current
}

export function isHtmlTagName(name: string): boolean {
  return /^[a-z][a-zA-Z0-9]*$/.test(name)
}

/** `null`, `undefined` and `false`: the values a JSX child renders as nothing. */
export function isNullish(expr: ts.Expression): boolean {
  if (expr.kind === ts.SyntaxKind.NullKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) return true
  return ts.isIdentifier(expr) && expr.text === 'undefined'
}
