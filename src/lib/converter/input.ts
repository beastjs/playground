/** Normalize pasted HTML before TypeScript parses it as TSX. */
import ts from 'typescript'

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr'
])
const OPTIONAL_END = new Set(['li', 'dt', 'dd', 'p', 'rt', 'rp', 'optgroup', 'option', 'tr', 'td', 'th'])

/** Repair omitted HTML end tags in JSX before the strict TSX parse check. */
export function closeMissingHtmlTags(source: string): string {
  // Each pass fixes one tag and reparses. This keeps positions from TypeScript's
  // error-tolerant tree valid even when a repair changes the nesting.
  for (let pass = 0; pass < 100; pass++) {
    const tree = ts.createSourceFile('input.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const diagnostics = (tree as ts.SourceFile & { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? []
    if (diagnostics.length === 0) return source
    // Never use tag recovery to hide an unrelated syntax error.
    if (diagnostics.some((d) => d.code !== 17008 && d.code !== 17002 &&
      !(d.code === 1005 && ts.flattenDiagnosticMessageText(d.messageText, ' ') === "'</' expected."))) return source

    let edit: { start: number; end: number; text: string } | undefined
    const visit = (node: ts.Node): void => {
      if (edit) return
      if (ts.isJsxElement(node)) {
        const name = node.openingElement.tagName.getText(tree)
        if (/^[a-z][a-zA-Z0-9-]*$/u.test(name)) {
          if (VOID_ELEMENTS.has(name)) {
            edit = { start: node.openingElement.end - 1, end: node.openingElement.end - 1, text: '/' }
            return
          }
          // HTML closes these elements when another of the same kind starts.
          if (OPTIONAL_END.has(name)) {
            const sibling = node.children.find((child) =>
              ts.isJsxElement(child) && child.openingElement.tagName.getText(tree) === name
            )
            if (sibling) {
              edit = { start: sibling.getStart(tree), end: sibling.getStart(tree), text: `</${name}>` }
              return
            }
          }
          ts.forEachChild(node, visit)
          if (edit) return
          const closing = node.closingElement
          if (closing.tagName.getText(tree) !== name) {
            // A mismatched close belongs to an ancestor. Insert this element's
            // close in front of it; an empty synthetic close has the same pos.
            edit = { start: closing.getStart(tree), end: closing.getStart(tree), text: `</${name}>` }
            return
          }
        }
      } else {
        ts.forEachChild(node, visit)
      }
    }
    visit(tree)
    if (!edit) return source
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
  }
  return source
}

export function stripHtmlComments(source: string): string {
  const comments = [...source.matchAll(/<!--[\s\S]*?-->/gu)]
  if (comments.length === 0) return source

  // A same-length JSX expression lets the parser tell markup apart from
  // strings, attributes, templates, regexes and TypeScript comments. Keep line
  // breaks and offsets intact so diagnostics still point into the input.
  const probe = source.replace(/<!--[\s\S]*?-->/gu, (comment) =>
    '{0' + comment.slice(2, -1).replace(/[^\r\n]/gu, ' ') + '}'
  )
  const tree = ts.createSourceFile('input.tsx', probe, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const candidates = new Map(comments.map((comment) => [comment.index, comment]))
  const replacements = new Map<number, string>()
  const visit = (node: ts.Node): void => {
    const start = node.getStart(tree)
    const comment = candidates.get(start)
    if (comment && node.end === start + comment[0].length) {
      if (ts.isJsxExpression(node)) {
        // Empty JSX comments disappear without introducing rendered spaces.
        replacements.set(start, '{/*' + comment[0].slice(3, -3).replace(/[^\r\n]/gu, ' ') + '*/}')
      } else if (ts.isBlock(node) && ts.isSourceFile(node.parent)) {
        replacements.set(start, comment[0].replace(/[^\r\n]/gu, ' '))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return source.replace(/<!--[\s\S]*?-->/gu, (comment, offset: number) => replacements.get(offset) ?? comment)
}
