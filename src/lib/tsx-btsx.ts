import ts from "typescript";

/**
 * Converts a .tsx source string into the custom ".btsx" template syntax.
 *
 * The transformation rules were reverse-engineered from example input/output
 * pairs. See README.md for the documented rule set and known limitations.
 */

const INDENT = "  ";

/** Thrown when the input cannot be parsed as TSX. */
export class BtsxConversionError extends Error {
  readonly diagnostics: readonly string[];
  constructor(diagnostics: readonly string[]) {
    super(`Input is not valid TSX:\n${diagnostics.join("\n")}`);
    this.name = "BtsxConversionError";
    this.diagnostics = diagnostics;
  }
}

/** ---------- small utilities ---------- */

function indentLines(lines: string[], levels: number): string[] {
  const prefix = INDENT.repeat(levels);
  return lines.map((line) => (line.length === 0 ? line : prefix + line));
}

/** Convert single-quoted string literals to double-quoted, leaving already-double-quoted text alone. */
function toDoubleQuotedString(raw: string): string {
  const inner = raw.slice(1, -1);
  // Un-escape \' then escape any raw " that weren't already escaped.
  const unescapedSingle = inner.replace(/\\'/g, "'");
  const escapedDouble = unescapedSingle.replace(/(?<!\\)"/g, '\\"');
  return `"${escapedDouble}"`;
}

/** Replace every single-quoted string literal token in a chunk of source text with a double-quoted one. */
function requoteSource(printer: ts.Printer, sourceFile: ts.SourceFile, node: ts.Node): string {
  const text = printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
  return requoteText(text);
}

function requoteText(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") {
      let j = i + 1;
      let body = "";
      while (j < text.length && text[j] !== "'") {
        if (text[j] === "\\" && j + 1 < text.length) {
          body += text[j] + text[j + 1];
          j += 2;
          continue;
        }
        body += text[j];
        j++;
      }
      out += toDoubleQuotedString(`'${body}'`);
      i = j + 1;
    } else if (ch === '"') {
      // already double-quoted string literal, copy verbatim
      let j = i + 1;
      let body = ch;
      while (j < text.length && text[j] !== '"') {
        if (text[j] === "\\" && j + 1 < text.length) {
          body += text[j] + text[j + 1];
          j += 2;
          continue;
        }
        body += text[j];
        j++;
      }
      body += text[j] ?? "";
      out += body;
      i = j + 1;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/** ---------- the converter ---------- */

interface ConvertContext {
  sourceFile: ts.SourceFile;
  printer: ts.Printer;
  sourceText: string;
}

export function convertTsxToBtsx(source: string): string {
  const sourceFile = ts.createSourceFile(
    "input.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  assertParsed(sourceFile);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const ctx: ConvertContext = { sourceFile, printer, sourceText: source };

  const rootIndex = findRootComponentIndex(sourceFile.statements);
  const outputLines: string[] = [];
  let moduleBuffer: string[] = [];

  const flushModuleBuffer = () => {
    if (moduleBuffer.length === 0) return;
    outputLines.push("module");
    outputLines.push(...indentLines(moduleBuffer, 1));
    moduleBuffer = [];
  };

  const statements = sourceFile.statements;
  for (let idx = 0; idx < statements.length; idx++) {
    const statement = statements[idx];
    const leadingComment = getLeadingLineComment(ctx, statement);
    if (leadingComment !== null) {
      // A section-marker comment flushes any pending declarations first so
      // the comment always introduces a fresh section.
      flushModuleBuffer();
      outputLines.push(leadingComment);
    }

    if (ts.isImportDeclaration(statement)) {
      const rendered = renderImportDeclaration(ctx, statement);
      if (rendered !== null) outputLines.push(rendered);
      continue;
    }

    if (ts.isFunctionDeclaration(statement)) {
      flushModuleBuffer();
      const name = statement.name ? statement.name.text : "Anonymous";
      outputLines.push(...renderFunctionComponent(ctx, statement, name, idx === rootIndex));
      continue;
    }

    const arrowComponent = getArrowComponent(statement);
    if (arrowComponent) {
      flushModuleBuffer();
      outputLines.push(
        ...renderFunctionComponent(ctx, arrowComponent.fn, arrowComponent.name, idx === rootIndex)
      );
      continue;
    }

    // type alias / interface / variable statement / anything else declarative
    moduleBuffer.push(...renderModuleMember(ctx, statement));
  }
  flushModuleBuffer();

  return outputLines.join("\n") + "\n";
}

/**
 * The TypeScript parser is error-tolerant: it happily returns a tree full of
 * garbage for garbage input. Surfacing the diagnostics turns a silently
 * nonsensical conversion into an actionable message.
 */
function assertParsed(sourceFile: ts.SourceFile): void {
  const diagnostics = (sourceFile as ts.SourceFile & {
    parseDiagnostics?: ts.DiagnosticWithLocation[];
  }).parseDiagnostics;
  if (!diagnostics || diagnostics.length === 0) return;
  const messages = diagnostics.slice(0, 5).map((d) => {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(d.start);
    const text = ts.flattenDiagnosticMessageText(d.messageText, " ");
    return `${line + 1}:${character + 1} ${text}`;
  });
  throw new BtsxConversionError(messages);
}

/** Returns the exact `// ...` comment text immediately preceding a statement, if any, else null. */
function getLeadingLineComment(ctx: ConvertContext, node: ts.Node): string | null {
  const ranges = ts.getLeadingCommentRanges(ctx.sourceText, node.getFullStart());
  if (!ranges || ranges.length === 0) return null;
  const last = ranges[ranges.length - 1];
  const text = ctx.sourceText.slice(last.pos, last.end);
  if (last.kind === ts.SyntaxKind.SingleLineCommentTrivia) return text;
  return null;
}

/** ---------- imports ---------- */

function renderImportDeclaration(ctx: ConvertContext, node: ts.ImportDeclaration): string | null {
  const clause = node.importClause;
  const moduleSpecifierText = node.moduleSpecifier.getText(ctx.sourceFile);
  const isReact = stripQuotes(moduleSpecifierText) === "react";
  const target = isReact ? '"octane"' : requoteText(moduleSpecifierText);

  // `import "./side-effect.css"` has no clause and carries no types to strip.
  if (!clause) return `import ${target};`;
  // The whole statement is type-only (`import type { A } from "x"`).
  if (clause.isTypeOnly) return null;

  const parts: string[] = [];
  if (clause.name) parts.push(clause.name.text);

  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) {
    parts.push(`* as ${bindings.name.text}`);
  } else if (bindings && ts.isNamedImports(bindings)) {
    const keptNames = bindings.elements
      .filter((el) => !el.isTypeOnly)
      .map((el) => el.name.text);
    if (keptNames.length > 0) parts.push(`{ ${keptNames.join(", ")} }`);
  }

  // Every specifier was type-only, so the import carries nothing at runtime.
  if (parts.length === 0) return null;

  return `import ${parts.join(", ")} from ${target};`;
}

function stripQuotes(text: string): string {
  return text.slice(1, -1);
}

/** ---------- module-level declarations (type/interface/const/let/var) ---------- */

function renderModuleMember(ctx: ConvertContext, statement: ts.Statement): string[] {
  if (ts.isInterfaceDeclaration(statement)) {
    return renderInterface(ctx, statement);
  }
  if (ts.isTypeAliasDeclaration(statement)) {
    const text = requoteSource(ctx.printer, ctx.sourceFile, statement);
    return [ensureSemicolon(text)];
  }
  // const/let/var and anything else: print + requote + ensure semicolon.
  const text = requoteSource(ctx.printer, ctx.sourceFile, statement);
  return [ensureSemicolon(text)];
}

function renderInterface(ctx: ConvertContext, node: ts.InterfaceDeclaration): string[] {
  const lines: string[] = [];
  lines.push(`interface ${node.name.text} {`);
  for (const member of node.members) {
    if (ts.isPropertySignature(member) && member.name && member.type) {
      const propName = member.name.getText(ctx.sourceFile);
      const optional = member.questionToken ? "?" : "";
      const typeText = renderTypeForProperty(ctx, member.type);
      lines.push(`${INDENT}${propName}${optional}: ${typeText};`);
    }
  }
  lines.push("}");
  return lines;
}

/**
 * Interface members reuse the inline type renderer so a nested object type stays
 * on one line; the printer's own multi-line form would break the surrounding
 * indentation, which is structural in BTSX.
 */
function renderTypeForProperty(ctx: ConvertContext, typeNode: ts.TypeNode): string {
  return renderTypeInline(ctx, typeNode);
}

function ensureSemicolon(text: string): string {
  return text.endsWith(";") ? text : `${text};`;
}

/** ---------- function declarations -> `component` blocks or root `props` block ---------- */

/**
 * Renders one `setup` statement. A statement that prints on a single line uses
 * the inline `setup <stmt>;` form; anything multi-line (a block-bodied arrow, an
 * `if`) must use the indented block form, because BTSX is line-oriented and an
 * unmarked continuation line would be parsed as markup.
 */
function renderSetupStatement(ctx: ConvertContext, stmt: ts.Statement): string[] {
  const text = ensureSemicolon(requoteSource(ctx.printer, ctx.sourceFile, stmt));
  const lines = text.split("\n");
  if (lines.length === 1) return [`setup ${text}`];
  return ["setup", ...indentLines(lines, 1)];
}

type ComponentFn = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

/**
 * Detects `const Foo = (props) => <jsx/>` / `const Foo = function () { ... }`
 * at the top level. Only initializers that actually return JSX are treated as
 * components — everything else stays an ordinary `module` declaration.
 */
function getArrowComponent(
  statement: ts.Statement
): { name: string; fn: ts.ArrowFunction | ts.FunctionExpression } | null {
  if (!ts.isVariableStatement(statement)) return null;
  const declarations = statement.declarationList.declarations;
  if (declarations.length !== 1) return null;

  const [declaration] = declarations;
  if (!ts.isIdentifier(declaration.name)) return null;

  const init = declaration.initializer;
  if (!init) return null;
  if (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init)) return null;
  if (!returnsJsx(init)) return null;

  return { name: declaration.name.text, fn: init };
}

function returnsJsx(fn: ts.ArrowFunction | ts.FunctionExpression): boolean {
  if (!ts.isBlock(fn.body)) return isJsxLike(unwrapParens(fn.body));
  return fn.body.statements.some(
    (stmt) => ts.isReturnStatement(stmt) && stmt.expression !== undefined && isJsxLike(unwrapParens(stmt.expression))
  );
}

function isJsxLike(expr: ts.Expression): boolean {
  return ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr) || ts.isJsxFragment(expr);
}

/**
 * Picks the one component that becomes the file's bare `props` block at column
 * zero. Beast files put helper components in named `component X` blocks and give
 * only the file's own component the top-level `props` line, so the default
 * export wins; failing that, the last component that takes props does.
 */
function findRootComponentIndex(statements: ts.NodeArray<ts.Statement>): number {
  let fallback = -1;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    const fn = ts.isFunctionDeclaration(statement)
      ? statement
      : (getArrowComponent(statement)?.fn ?? null);
    if (!fn) continue;
    if (!getRootPropsParam(fn)) continue;

    if (hasDefaultExport(statement)) return i;
    fallback = i;
  }

  return fallback;
}

function hasDefaultExport(statement: ts.Statement): boolean {
  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
}

function renderFunctionComponent(
  ctx: ConvertContext,
  fn: ComponentFn,
  name: string,
  isRoot: boolean
): string[] {
  if (fn.body === undefined) return [];

  const rootParam = getRootPropsParam(fn);

  // An arrow function with a concise body has no statements to hoist into
  // `setup` lines — its whole body is the returned expression.
  const { setupStatements, returnExpr } = ts.isBlock(fn.body)
    ? splitBody(fn.body)
    : { setupStatements: [] as ts.Statement[], returnExpr: fn.body as ts.Expression };

  const body: string[] = [];
  if (rootParam) body.push(`props ${renderRootPropsHeader(ctx, rootParam)}`);
  for (const stmt of setupStatements) body.push(...renderSetupStatement(ctx, stmt));
  if (returnExpr) body.push(...emitJsxNode(ctx, returnExpr, 0));

  // The file's own component sits at column zero; every other one is a named
  // `component` block with its props nested inside it.
  if (isRoot) return body;
  return [`component ${name}`, ...indentLines(body, 1)];
}

/** A "root" component is one whose single parameter is `{ ...destructured }: SomeType`. */
function getRootPropsParam(fn: ComponentFn): ts.ParameterDeclaration | null {
  if (fn.parameters.length !== 1) return null;
  const [param] = fn.parameters;
  if (!ts.isObjectBindingPattern(param.name)) return null;
  if (!param.type) return null;
  return param;
}

function renderRootPropsHeader(ctx: ConvertContext, param: ts.ParameterDeclaration): string {
  const pattern = requoteSource(ctx.printer, ctx.sourceFile, param.name);
  const type = param.type ? renderTypeInline(ctx, param.type) : "unknown";
  return `${pattern}: ${type}`;
}

/**
 * Renders a type node as a single line, collapsing multi-line object type
 * literals (as the default TS printer/formatter would emit them) into
 * `{ member; member }` form with `;`-separated members.
 */
function renderTypeInline(ctx: ConvertContext, typeNode: ts.TypeNode): string {
  // ReactNode (and React.ReactNode) has no meaning in the target runtime.
  if (ts.isTypeReferenceNode(typeNode)) {
    const name = typeNode.typeName.getText(ctx.sourceFile);
    if (name === "ReactNode" || name === "React.ReactNode") return "unknown";
  }
  if (ts.isTypeLiteralNode(typeNode)) {
    const members = typeNode.members
      .filter(ts.isPropertySignature)
      .map((member) => {
        const name = member.name.getText(ctx.sourceFile);
        const optional = member.questionToken ? "?" : "";
        const memberType = member.type ? renderTypeInline(ctx, member.type) : "unknown";
        return `${name}${optional}: ${memberType}`;
      });
    return `{ ${members.join("; ")} }`;
  }
  if (ts.isArrayTypeNode(typeNode)) {
    return `${renderTypeInline(ctx, typeNode.elementType)}[]`;
  }
  return requoteSource(ctx.printer, ctx.sourceFile, typeNode);
}

function splitBody(body: ts.Block): { setupStatements: ts.Statement[]; returnExpr: ts.Expression | null } {
  const setupStatements: ts.Statement[] = [];
  let returnExpr: ts.Expression | null = null;
  for (const stmt of body.statements) {
    if (ts.isReturnStatement(stmt)) {
      returnExpr = stmt.expression ?? null;
      continue;
    }
    setupStatements.push(stmt);
  }
  return { setupStatements, returnExpr };
}

/** ---------- JSX -> pug-like emitter ---------- */

/** Entry point: emit a returned expression, which is typically a JSX element possibly wrapped in parens. */
function emitJsxNode(ctx: ConvertContext, expr: ts.Expression, indent: number): string[] {
  const unwrapped = unwrapParens(expr);
  return emitElementOrExpression(ctx, unwrapped, indent);
}

function unwrapParens(expr: ts.Expression): ts.Expression {
  let current = expr;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function emitElementOrExpression(
  ctx: ConvertContext,
  node: ts.Expression,
  indent: number,
  omit?: ReadonlySet<string>
): string[] {
  if (ts.isJsxElement(node)) return emitJsxElement(ctx, node, indent, omit);
  if (ts.isJsxSelfClosingElement(node)) return emitSelfClosing(ctx, node, indent, omit);
  if (ts.isJsxFragment(node)) return emitChildren(ctx, meaningfulChildren(node.children), indent);
  // Fallback: raw expression (shouldn't normally happen at element position).
  return [`${INDENT.repeat(indent)}#{${renderExpr(ctx, node)}}`];
}

function tagName(node: ts.JsxTagNameExpression): string {
  return node.getText();
}

function isHtmlTagName(name: string): boolean {
  return /^[a-z][a-zA-Z0-9]*$/.test(name) && !name.includes(".");
}

interface AttrInfo {
  className: { kind: "shorthand"; value: string } | { kind: "raw"; text: string } | null;
  /** Static `id="foo"` on an HTML tag, rendered as the `#foo` selector shorthand. */
  id: string | null;
  rest: string[]; // rendered "name={expr}" / 'name="str"' pairs, in original order
}

/** `#foo` shorthand only works for ids that are valid selector fragments. */
function isSelectorSafe(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(value);
}

function collectAttrs(
  ctx: ConvertContext,
  attrs: ts.JsxAttributes,
  isHtml: boolean,
  omit?: ReadonlySet<string>
): AttrInfo {
  const rest: string[] = [];
  let className: AttrInfo["className"] = null;
  let id: string | null = null;
  // A selector shorthand always renders before the attribute list, so hoisting
  // a `className`/`id` that the source wrote *after* a spread would silently
  // flip which one wins. Once a spread is seen, keep them as plain attributes.
  let seenSpread = false;

  for (const attr of attrs.properties) {
    if (ts.isJsxSpreadAttribute(attr)) {
      rest.push(`...${renderExpr(ctx, attr.expression)}`);
      seenSpread = true;
      continue;
    }
    if (!ts.isJsxAttribute(attr)) continue;
    const attrName = attr.name.getText(ctx.sourceFile);
    // `key` is hoisted onto the enclosing `each` line, so drop it here.
    if (omit && omit.has(attrName)) continue;
    const rendered = renderAttrValue(ctx, attr);

    if (!seenSpread && isHtml && attrName === "id" && attr.initializer && ts.isStringLiteral(attr.initializer)) {
      if (isSelectorSafe(attr.initializer.text)) {
        id = attr.initializer.text;
        continue;
      }
    }

    if (!seenSpread && isHtml && attrName === "className" && attr.initializer && ts.isStringLiteral(attr.initializer)) {
      const value = attr.initializer.text;
      if (value.length > 0 && !value.includes(" ")) {
        className = { kind: "shorthand", value };
        continue;
      }
      className = { kind: "raw", text: rendered };
      continue;
    }

    rest.push(rendered);
  }

  return { className, id, rest };
}

function renderAttrValue(ctx: ConvertContext, attr: ts.JsxAttribute): string {
  const name = attr.name.getText(ctx.sourceFile);
  if (!attr.initializer) return name; // boolean attribute shorthand
  if (ts.isStringLiteral(attr.initializer)) {
    return `${name}=${toDoubleQuotedString(attr.initializer.getText(ctx.sourceFile))}`;
  }
  if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
    return `${name}={${renderExpr(ctx, attr.initializer.expression)}}`;
  }
  return name;
}

function renderExpr(ctx: ConvertContext, expr: ts.Expression): string {
  return requoteSource(ctx.printer, ctx.sourceFile, expr);
}

/**
 * Beyond this width a tag's attribute list is broken across `~` continuation
 * lines instead of being emitted as one very long line.
 */
const MAX_TAG_LINE = 100;

/** Builds the `tag#id.class` selector, collapsing an implicit `div`. */
function buildSelector(name: string, isHtml: boolean, attrs: AttrInfo): string {
  if (!isHtml) return name;

  const id = attrs.id ? `#${attrs.id}` : "";
  const cls =
    attrs.className && attrs.className.kind === "shorthand" ? `.${attrs.className.value}` : "";

  // `div` is the implicit tag, so `div#foo.bar` writes as `#foo.bar` — but a
  // bare `div` with no selector still needs its name.
  const base = name === "div" && (id || cls) ? "" : name;
  return `${base}${id}${cls}`;
}

/**
 * Renders a tag line. Returns multiple lines when the attribute list is long
 * enough to warrant `~` continuations, which is why callers take a string[].
 */
function buildTagLines(name: string, isHtml: boolean, attrs: AttrInfo, indent: number): string[] {
  const selector = buildSelector(name, isHtml, attrs);

  const rest = [...attrs.rest];
  if (isHtml && attrs.className && attrs.className.kind === "raw") {
    // Non-shorthand className kept as a regular attribute (fallback path).
    rest.unshift(attrs.className.text);
  }

  const pad = INDENT.repeat(indent);
  if (rest.length === 0) return [`${pad}${selector}`];

  const singleLine = `${pad}${selector}(${rest.join(" ")})`;
  if (singleLine.length <= MAX_TAG_LINE || rest.length < 2) return [singleLine];

  const contPad = INDENT.repeat(indent + 1);
  return [`${pad}${selector}(`, ...rest.map((attr) => `${contPad}~ ${attr}`), `${contPad}~ )`];
}



function emitSelfClosing(
  ctx: ConvertContext,
  node: ts.JsxSelfClosingElement,
  indent: number,
  omit?: ReadonlySet<string>
): string[] {
  const name = tagName(node.tagName);
  const isHtml = isHtmlTagName(name);
  const attrs = collectAttrs(ctx, node.attributes, isHtml, omit);
  return buildTagLines(name, isHtml, attrs, indent);
}

function emitJsxElement(
  ctx: ConvertContext,
  node: ts.JsxElement,
  indent: number,
  omit?: ReadonlySet<string>
): string[] {
  const name = tagName(node.openingElement.tagName);
  const isHtml = isHtmlTagName(name);
  const attrs = collectAttrs(ctx, node.openingElement.attributes, isHtml, omit);
  const tagLines = buildTagLines(name, isHtml, attrs, indent);

  const meaningful = meaningfulChildren(node.children);
  if (meaningful.length === 0) return tagLines;

  // Once the attribute list is split across `~` continuation lines there is no
  // "end of the tag line" left to append to, so content becomes a child line.
  const canInline = tagLines.length === 1;
  const head = tagLines[0];

  if (canInline) {
    // Inline case: a single "simple" expression child.
    if (meaningful.length === 1 && isSimpleExprChild(meaningful[0])) {
      const exprText = renderExpr(ctx, (meaningful[0] as ts.JsxExpression).expression as ts.Expression);
      return [`${head} #{${exprText}}`];
    }

    // Inline case: a single plain-text child (no expressions at all).
    if (meaningful.length === 1 && ts.isJsxText(meaningful[0])) {
      return [`${head} ${normalizeJsxText((meaningful[0] as ts.JsxText).text)}`];
    }

    // Inline case: text mixed with simple expressions, no element children.
    if (isInlineTextRun(meaningful)) {
      const inline = renderInlineTextRun(ctx, meaningful);
      return [`${head}${inline.length > 0 ? " " + inline : ""}`];
    }
  }

  return [...tagLines, ...emitChildren(ctx, meaningful, indent + 1)];
}

function meaningfulChildren(children: ts.NodeArray<ts.JsxChild>): ts.JsxChild[] {
  return children.filter((child) => {
    if (ts.isJsxText(child)) {
      return normalizeJsxText(child.text).length > 0;
    }
    return true;
  });
}

function isSimpleExprChild(child: ts.JsxChild): boolean {
  if (!ts.isJsxExpression(child) || !child.expression) return false;
  const expr = child.expression;
  if (ts.isConditionalExpression(expr)) return false;
  if (isIterationCall(expr)) return false;
  if (getLogicalGuard(expr) !== null) return false;
  return true;
}

function isInlineTextRun(children: ts.JsxChild[]): boolean {
  const hasElement = children.some((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxFragment(c));
  if (hasElement) return false;
  const exprChildren = children.filter((c) => ts.isJsxExpression(c));
  if (exprChildren.length === 0) return false; // pure text single child already handled elsewhere / trivial
  // Every expression child (if more than one) must be simple; block constructs force the block layout.
  return exprChildren.every((c) => isSimpleExprChild(c));
}

function renderInlineTextRun(ctx: ConvertContext, children: ts.JsxChild[]): string {
  let out = "";
  for (const child of children) {
    if (ts.isJsxText(child)) {
      out += normalizeJsxText(child.text);
    } else if (ts.isJsxExpression(child) && child.expression) {
      out += `#{${renderExpr(ctx, child.expression)}}`;
    }
  }
  return out.trim();
}

/** Emit a list of sibling children, each becoming one or more indented lines. */
function emitChildren(ctx: ConvertContext, children: ts.JsxChild[], indent: number): string[] {
  const pad = INDENT.repeat(indent);
  const lines: string[] = [];
  for (const child of children) {
    if (ts.isJsxText(child)) {
      const text = normalizeJsxText(child.text);
      if (text.length > 0) lines.push(`${pad}| ${text}`);
      continue;
    }
    if (ts.isJsxElement(child)) {
      lines.push(...emitJsxElement(ctx, child, indent));
      continue;
    }
    if (ts.isJsxSelfClosingElement(child)) {
      lines.push(...emitSelfClosing(ctx, child, indent));
      continue;
    }
    if (ts.isJsxFragment(child)) {
      lines.push(...emitChildren(ctx, meaningfulChildren(child.children).slice(), indent));
      continue;
    }
    if (ts.isJsxExpression(child) && child.expression) {
      lines.push(...emitJsxExpressionChild(ctx, child.expression, indent));
      continue;
    }
  }
  return lines;
}

function emitJsxExpressionChild(ctx: ConvertContext, expr: ts.Expression, indent: number): string[] {
  const pad = INDENT.repeat(indent);

  if (ts.isConditionalExpression(expr)) return emitConditional(ctx, expr, indent, "if");

  // `{cond && <X/>}` is an `if` with no `else` branch.
  const guard = getLogicalGuard(expr);
  if (guard) {
    return [`${pad}if ${renderExpr(ctx, guard.condition)}`, ...emitElementOrExpression(ctx, guard.body, indent + 1)];
  }

  const iteration = emitIteration(ctx, expr, indent);
  if (iteration) return iteration;

  // Plain expression sibling among other children.
  return [`${pad}| #{${renderExpr(ctx, expr)}}`];
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
  keyword: "if" | "elseif"
): string[] {
  const pad = INDENT.repeat(indent);
  const lines: string[] = [`${pad}${keyword} ${renderExpr(ctx, expr.condition)}`];
  lines.push(...emitElementOrExpression(ctx, unwrapParens(expr.whenTrue), indent + 1));

  const otherwise = unwrapParens(expr.whenFalse);
  if (ts.isConditionalExpression(otherwise)) {
    lines.push(...emitConditional(ctx, otherwise, indent, "elseif"));
    return lines;
  }

  // `cond ? <A/> : null` has no meaningful else branch to emit.
  if (isNullish(otherwise)) return lines;

  lines.push(`${pad}else`);
  lines.push(...emitElementOrExpression(ctx, otherwise, indent + 1));
  return lines;
}

function isNullish(expr: ts.Expression): boolean {
  if (expr.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isIdentifier(expr) && expr.text === "undefined") return true;
  if (ts.isLiteralExpression(expr) && expr.kind === ts.SyntaxKind.FalseKeyword) return true;
  return expr.kind === ts.SyntaxKind.FalseKeyword;
}

/** Matches `cond && <jsx/>`, the guard form React uses in place of a one-armed if. */
function getLogicalGuard(
  expr: ts.Expression
): { condition: ts.Expression; body: ts.Expression } | null {
  if (!ts.isBinaryExpression(expr)) return null;
  if (expr.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return null;
  const body = unwrapParens(expr.right);
  if (!isJsxLike(body)) return null;
  return { condition: expr.left, body };
}

/**
 * Emits an `each` block. A `key` prop on the iterated element is hoisted onto
 * the `each` line (`each item in list key item.id`) rather than left as an
 * attribute, matching how the key is written by hand.
 */
function emitIteration(ctx: ConvertContext, expr: ts.Expression, indent: number): string[] | null {
  const info = getMapIterableInfo(ctx, expr);
  if (!info) return null;

  const pad = INDENT.repeat(indent);
  const keyText = info.body ? getKeyAttribute(ctx, info.body) : null;
  const header = `${pad}each ${info.bindings} in ${info.iterable}${keyText ? ` key ${keyText}` : ""}`;

  const lines = [header];
  if (info.body) {
    const omit = keyText ? new Set(["key"]) : undefined;
    lines.push(...emitElementOrExpression(ctx, info.body, indent + 1, omit));
  }
  return lines;
}

/** Reads a `key={expr}` / `key="str"` prop off the element an `each` produces. */
function getKeyAttribute(ctx: ConvertContext, node: ts.Expression): string | null {
  let attributes: ts.JsxAttributes | null = null;
  if (ts.isJsxElement(node)) attributes = node.openingElement.attributes;
  else if (ts.isJsxSelfClosingElement(node)) attributes = node.attributes;
  if (!attributes) return null;

  for (const attr of attributes.properties) {
    if (!ts.isJsxAttribute(attr)) continue;
    if (attr.name.getText(ctx.sourceFile) !== "key") continue;
    if (!attr.initializer) return null;
    if (ts.isStringLiteral(attr.initializer)) return toDoubleQuotedString(attr.initializer.getText(ctx.sourceFile));
    if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
      return renderExpr(ctx, attr.initializer.expression);
    }
  }
  return null;
}

interface IterationParts {
  iterable: ts.Expression;
  callback: ts.ArrowFunction;
}

/**
 * Recognizes the two iteration shapes that map onto an `each` block:
 * `__map_iterable(list, cb)` (the helper the Beast toolchain emits) and a
 * plain `list.map(cb)`.
 */
function getIterationParts(expr: ts.Expression): IterationParts | null {
  if (!ts.isCallExpression(expr)) return null;

  const callee = expr.expression;

  if (ts.isIdentifier(callee) && callee.text === "__map_iterable" && expr.arguments.length === 2) {
    const [iterable, callback] = expr.arguments;
    if (!ts.isArrowFunction(callback)) return null;
    return { iterable, callback };
  }

  if (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "map" &&
    expr.arguments.length === 1
  ) {
    const [callback] = expr.arguments;
    if (!ts.isArrowFunction(callback)) return null;
    return { iterable: callee.expression, callback };
  }

  return null;
}

function isIterationCall(expr: ts.Expression): boolean {
  return getIterationParts(expr) !== null;
}

function getMapIterableInfo(
  ctx: ConvertContext,
  expr: ts.Expression
): { bindings: string; iterable: string; body: ts.Expression | null } | null {
  const parts = getIterationParts(expr);
  if (!parts) return null;
  const { iterable: iterableArg, callback } = parts;

  const params = callback.parameters.map((p) => p.name.getText(ctx.sourceFile));
  const bindings = params.join(", ");
  const iterable = renderExpr(ctx, iterableArg);

  let body: ts.Expression | null = null;
  if (ts.isBlock(callback.body)) {
    for (const stmt of callback.body.statements) {
      if (ts.isReturnStatement(stmt) && stmt.expression) {
        body = unwrapParens(stmt.expression);
      }
    }
  } else {
    body = unwrapParens(callback.body);
  }

  return { bindings, iterable, body };
}

/** JSX whitespace normalization, matching the standard React/Babel algorithm closely enough for our needs. */
function normalizeJsxText(raw: string): string {
  const lines = raw.split("\n");
  if (lines.length === 1) return lines[0];

  let result = "";
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const isFirst = i === 0;
    const isLast = i === lines.length - 1;

    if (!isFirst) line = line.replace(/^[ \t]+/, "");
    if (!isLast) line = line.replace(/[ \t]+$/, "");

    if (line.length === 0) continue;

    if (result.length > 0 && !/\s$/.test(result)) result += " ";
    result += line;
  }
  return result;
}
