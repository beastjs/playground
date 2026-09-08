import ts from "typescript";
import {
  isReactModule,
  resolveBindingModule,
  resolveReactExport,
  resolveReactType
} from "./octane-bindings";

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

/**
 * Prints a node as BTSX-shaped source: single-quoted string literals become
 * double-quoted, and any React type the file imported is renamed to the Octane
 * name it was imported under (`ReactNode` -> `OctaneNode`).
 */
function requoteSource(ctx: ConvertContext, node: ts.Node): string {
  const text = ctx.printer.printNode(ts.EmitHint.Unspecified, node, ctx.sourceFile);
  return applyTypeRenames(ctx, requoteText(text));
}

/**
 * Rewrites references to the React types this file imported. A type is only
 * imported from `octane` if it is referenced, so the substitution is also what
 * records the need for the import.
 */
function applyTypeRenames(ctx: ConvertContext, text: string): string {
  let out = rewriteQualifiedReact(ctx, text);
  for (const [local, { render, importText }] of ctx.reactTypes) {
    const pattern = new RegExp(`\\b${local}\\b`, "gu");
    if (!pattern.test(out)) continue;
    ctx.octaneTypeImports.set(render, importText);
    out = out.replace(pattern, render);
  }
  return out;
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
  /**
   * React types this file imported, keyed by the name the code uses: how to
   * render a reference to it, and how to import it from `octane`.
   */
  reactTypes: Map<string, { render: string; importText: string }>;
  /** Of those, the ones the output actually references — only they get imported. */
  octaneTypeImports: Map<string, string>;
  /** Value imports the conversion resolved onto Octane, keyed by module. */
  octaneImports: Map<string, Map<string, string>>;
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
  const ctx: ConvertContext = { sourceFile, printer, sourceText: source, reactTypes: new Map(), octaneTypeImports: new Map(), octaneImports: new Map() };

  const rootIndex = findRootComponentIndex(sourceFile.statements);
  const outputLines: string[] = [];
  let moduleBuffer: string[] = [];
  // Where a generated `import type` belongs: after the imports the file wrote.
  let importEnd = 0;

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
      outputLines.push(...renderImportDeclaration(ctx, statement));
      importEnd = outputLines.length;
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

  // Octane's own imports are written last, because what a conversion needs is
  // only known once every annotation and statement has been rendered — a
  // `React.useState` deep in the body pulls in an import of its own. They still
  // belong with the imports the file wrote.
  const octaneImports: string[] = [];
  for (const [module, names] of ctx.octaneImports) {
    octaneImports.push(`import { ${[...names.values()].join(", ")} } from "${module}";`);
  }
  if (ctx.octaneTypeImports.size > 0) {
    octaneImports.push(`import type { ${[...ctx.octaneTypeImports.values()].join(", ")} } from "octane";`);
  }
  outputLines.splice(importEnd, 0, ...octaneImports);

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
function renderImportDeclaration(ctx: ConvertContext, node: ts.ImportDeclaration): string[] {
  const clause = node.importClause;
  const specifier = stripQuotes(node.moduleSpecifier.getText(ctx.sourceFile));
  const moduleTarget = resolveBindingModule(specifier) ?? specifier;
  const isReact = isReactModule(specifier);

  // `import "./side-effect.css"` has no clause and carries no types to strip.
  if (!clause) return [`import ${quote(moduleTarget)};`];
  // Type-only imports carry nothing at runtime and are dropped, except React's,
  // which name types the converted file still annotates with.
  if (clause.isTypeOnly && !isReact) return [];

  // A default or namespace import binds the module object itself, so it can
  // only follow a whole-module rewrite, never a per-symbol one.
  const bindings = clause.namedBindings;
  const defaultParts: string[] = [];
  if (clause.name && !isReact) defaultParts.push(clause.name.text);
  if (bindings && ts.isNamespaceImport(bindings) && !isReact) {
    defaultParts.push(`* as ${bindings.name.text}`);
  }

  const elements = bindings && ts.isNamedImports(bindings) ? bindings.elements : [];
  const groups = new Map<string, string[]>();
  const dropped: string[] = [];

  // Group the named imports by the module each one resolves to, keeping the
  // order they were written in.
  for (const el of elements) {
    const { local, alias } = readImportSpecifier(el);
    const isType = clause.isTypeOnly || el.isTypeOnly;

    if (!isReact) {
      if (isType) continue;
      addToGroup(groups, moduleTarget, alias ? `${local} as ${alias}` : local);
      continue;
    }

    const octaneType = isType ? resolveReactType(local) : null;
    if (isType) {
      if (octaneType === null) {
        dropped.push(local);
        continue;
      }
      ctx.reactTypes.set(alias ?? local, {
        render: alias ?? octaneType,
        importText: alias ? `${octaneType} as ${alias}` : octaneType
      });
      continue;
    }

    const target = resolveReactExport(specifier, local);
    if (target === null) {
      dropped.push(local);
      continue;
    }
    addOctaneImport(ctx, target, alias ? `${local} as ${alias}` : local);
  }

  const lines: string[] = [];
  if (dropped.length > 0) {
    lines.push(`// ${dropped.join(", ")}: no Octane equivalent, dropped from ${specifier}`);
  }
  if (defaultParts.length > 0) {
    const inline = groups.get(moduleTarget);
    if (inline) groups.delete(moduleTarget);
    const parts = [...defaultParts, ...(inline ? [`{ ${inline.join(", ")} }`] : [])];
    lines.push(`import ${parts.join(", ")} from ${quote(moduleTarget)};`);
  }
  for (const [target, names] of groups) {
    lines.push(`import { ${names.join(", ")} } from ${quote(target)};`);
  }
  return lines;
}

function addToGroup(groups: Map<string, string[]>, key: string, name: string): void {
  const group = groups.get(key);
  if (group) group.push(name);
  else groups.set(key, [name]);
}

/** The imported name and its local alias, if the specifier renames it. */
function readImportSpecifier(el: ts.ImportSpecifier): { local: string; alias: string | null } {
  // `import { original as local }` resolves by what it renames, not the alias.
  if (el.propertyName) return { local: el.propertyName.text, alias: el.name.text };
  return { local: el.name.text, alias: null };
}

function quote(text: string): string {
  return `"${text}"`;
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
    // Render the aliased type inline so an object literal type stays on one
    // line, matching how `module` declarations are written by hand.
    const name = statement.name.text;
    const params = statement.typeParameters
      ? `<${statement.typeParameters.map((t) => requoteSource(ctx, t)).join(", ")}>`
      : "";
    return [`type ${name}${params} = ${renderTypeInline(ctx, statement.type)};`];
  }
  // const/let/var and anything else: print + requote + ensure semicolon.
  const text = requoteSource(ctx, statement);
  return toLines(ensureSemicolon(text));
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

/**
 * Splits printed output into individual lines. `module` bodies are indented as
 * a block, and only whole lines get that indent — a statement left as one
 * string with embedded newlines would have its continuation lines land at
 * column 0, where Beast reads them as element selectors.
 */
function toLines(text: string): string[] {
  return text.split("\n");
}

function ensureSemicolon(text: string): string {
  return text.endsWith(";") ? text : `${text};`;
}

/** ---------- function declarations -> `component` blocks or root `props` block ---------- */

/**
 * Renders a component's hoisted statements as `setup`. One statement that
 * prints on a single line uses the inline `setup <stmt>;` form; everything else
 * goes into a single indented `setup` block, which takes any number of
 * declarations and functions. The block form is also mandatory for a multi-line
 * statement (a block-bodied arrow, an `if`), because BTSX is line-oriented and
 * an unmarked continuation line at column zero would be parsed as markup.
 */
function renderSetupBlock(ctx: ConvertContext, statements: readonly ts.Statement[]): string[] {
  const rendered = statements.map((stmt) =>
    toLines(ensureSemicolon(requoteSource(ctx, stmt)))
  );
  if (rendered.length === 0) return [];

  const [only] = rendered;
  if (rendered.length === 1 && only.length === 1) return [`setup ${only[0]}`];

  // A multi-line statement gets a blank line on either side so its body reads
  // as one unit instead of running into the neighbouring declarations.
  const source: string[] = [];
  rendered.forEach((lines, index) => {
    const previous = rendered[index - 1];
    if (previous && (previous.length > 1 || lines.length > 1)) source.push("");
    source.push(...lines);
  });
  return ["setup", ...indentLines(source, 1)];
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
  body.push(...renderSetupBlock(ctx, setupStatements));
  if (returnExpr) body.push(...emitRootJsx(ctx, returnExpr));

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
  const pattern = requoteSource(ctx, param.name);
  const type = param.type ? renderTypeInline(ctx, param.type) : "unknown";
  return `${pattern}: ${type}`;
}

/**
 * Rewrites `React.Something` wherever it appears in printed source. Code pasted
 * out of a React codebase reaches React through the namespace rather than a
 * named import, so there is nothing in the import list to key off — the
 * qualified name is the only evidence, and it is enough. Values and types both
 * resolve: `React.useState` becomes `useState`, `React.ComponentProps` becomes
 * `ComponentProps`, and each records the import it needs.
 */
function rewriteQualifiedReact(ctx: ConvertContext, text: string): string {
  return text.replace(/\bReact\.([A-Za-z_$][\w$]*)\b/gu, (whole, name: string) => {
    const value = resolveReactExport("react", name);
    if (value !== null) {
      addOctaneImport(ctx, value, name);
      return name;
    }
    const octane = resolveReactType(name);
    if (octane === null) return whole;
    ctx.octaneTypeImports.set(octane, octane);
    return octane;
  });
}

/** Records one value import the conversion resolved onto an Octane module. */
function addOctaneImport(ctx: ConvertContext, module: string, text: string): void {
  const names = ctx.octaneImports.get(module);
  if (names) names.set(text, text);
  else ctx.octaneImports.set(module, new Map([[text, text]]));
}

/**
 * The Octane rendering of a React type reference, recording the import it
 * needs, or null when the name is not a React type this file imported.
 */
function renderReactTypeReference(ctx: ConvertContext, name: string): string | null {
  const imported = ctx.reactTypes.get(name);
  if (imported) {
    ctx.octaneTypeImports.set(imported.render, imported.importText);
    return imported.render;
  }
  // `React.ReactNode` reaches the type through the default import, which the
  // conversion drops, so the name has to be imported on its own.
  if (!name.startsWith("React.")) return null;
  const octane = resolveReactType(name.slice("React.".length));
  if (octane === null) return null;
  ctx.octaneTypeImports.set(octane, octane);
  return octane;
}

/**
 * Renders a type node as a single line, collapsing multi-line object type
 * literals (as the default TS printer/formatter would emit them) into
 * `{ member; member }` form with `;`-separated members.
 */
function renderTypeInline(ctx: ConvertContext, typeNode: ts.TypeNode): string {
  // `ReactNode` / `React.ReactNode` (and every other React type Octane restates)
  // becomes its Octane name. Only names this file imported from React qualify,
  // so a local type that happens to share a name with one is left alone.
  if (ts.isTypeReferenceNode(typeNode)) {
    const rendered = renderReactTypeReference(ctx, typeNode.typeName.getText(ctx.sourceFile));
    const args = typeNode.typeArguments;
    if (rendered !== null) {
      if (args === undefined) return rendered;
      return `${rendered}<${args.map((arg) => renderTypeInline(ctx, arg)).join(", ")}>`;
    }
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
  return requoteSource(ctx, typeNode);
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

/**
 * A component whose root is an explicit `<>...</>` emits a `fragment` block.
 * Multiple roots are legal without it, but keeping the author's fragment makes
 * the grouping explicit — and a `style` block needs something to sit beside.
 */
function emitRootJsx(ctx: ConvertContext, expr: ts.Expression): string[] {
  const root = unwrapParens(expr);
  if (ts.isJsxFragment(root)) {
    const children = meaningfulChildren(root.children);
    if (children.length > 1) return ["fragment", ...emitChildren(ctx, children, 1)];
  }
  return emitJsxNode(ctx, expr, 0);
}

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
  // A bare expression at element position must be pipe text: an unprefixed
  // `#{...}` line parses as an id selector and Beast rejects it with
  // BEAST1101_INVALID_SELECTOR.
  return [`${INDENT.repeat(indent)}| #{${renderExpr(ctx, node)}}`];
}

/**
 * The element name as BTSX writes it. `<React.Suspense>` resolves the same way
 * a `React.` reference in an expression does, so namespaced JSX lands on the
 * Octane component instead of a React namespace that is no longer imported.
 */
function tagName(ctx: ConvertContext, node: ts.JsxTagNameExpression): string {
  return rewriteQualifiedReact(ctx, node.getText());
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
      rest.push(`{...${renderExpr(ctx, attr.expression)}}`);
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
      // The selector grammar accepts a narrow charset. Tailwind values such as
      // `sm:px-2`, `bg-black/40` or `w-[calc(100%-1rem)]` are rejected outright,
      // and a dotted value like `p-2.5` is worse — it parses as two classes
      // (`p-2` and `5`). Anything outside the charset stays a plain attribute.
      if (isSelectorSafe(value)) {
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
  return requoteSource(ctx, expr);
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
  const name = tagName(ctx, node.tagName);
  const isHtml = isHtmlTagName(name);
  const attrs = collectAttrs(ctx, node.attributes, isHtml, omit);
  return buildTagLines(name, isHtml, attrs, indent);
}

/**
 * Recognises the immediately-invoked switch React uses to pick between elements:
 * `{(() => { switch (k) { case "a": return <A/>; default: return <D/> } })()}`.
 * Consecutive labels that share a body collapse into one `case a, b` arm.
 */
function emitSwitchBlock(ctx: ConvertContext, expr: ts.Expression, indent: number): string[] | null {
  if (!ts.isCallExpression(expr) || expr.arguments.length !== 0) return null;

  const callee = unwrapParens(expr.expression);
  if (!ts.isArrowFunction(callee) && !ts.isFunctionExpression(callee)) return null;
  if (!ts.isBlock(callee.body)) return null;

  const statements = callee.body.statements;
  if (statements.length !== 1) return null;
  const [only] = statements;
  if (!ts.isSwitchStatement(only)) return null;

  const pad = INDENT.repeat(indent);
  const lines = [`${pad}switch ${renderExpr(ctx, only.expression)}`];

  // Labels with no statements fall through to the next clause's body.
  let pendingLabels: string[] = [];
  for (const clause of only.caseBlock.clauses) {
    const label = ts.isCaseClause(clause) ? renderExpr(ctx, clause.expression) : null;
    if (clause.statements.length === 0) {
      if (label !== null) pendingLabels.push(label);
      continue;
    }

    const labels = label === null ? [] : [...pendingLabels, label];
    pendingLabels = [];
    lines.push(labels.length > 0 ? `${pad}${INDENT}case ${labels.join(", ")}` : `${pad}${INDENT}default`);

    const returned = clause.statements.find(ts.isReturnStatement)?.expression;
    if (returned && !isNullish(unwrapParens(returned))) {
      lines.push(...emitElementOrExpression(ctx, unwrapParens(returned), indent + 2));
    }
  }

  // A `switch` with no arm carries no meaning; fall back to the generic path.
  return lines.length > 1 ? lines : null;
}

/** Reads a `fallback={...}` prop off a boundary element. */
function getFallback(ctx: ConvertContext, attrs: ts.JsxAttributes): ts.Expression | null {
  for (const attr of attrs.properties) {
    if (!ts.isJsxAttribute(attr)) continue;
    if (attr.name.getText(ctx.sourceFile) !== "fallback") continue;
    if (!attr.initializer) return null;
    if (ts.isStringLiteral(attr.initializer)) return attr.initializer;
    if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
      return attr.initializer.expression;
    }
  }
  return null;
}

/** Emits a fallback as block content: JSX recurses, anything else is pipe text. */
function emitFallbackBody(ctx: ConvertContext, fallback: ts.Expression, indent: number): string[] {
  const expr = unwrapParens(fallback);
  if (isJsxLike(expr) || ts.isJsxFragment(expr)) return emitElementOrExpression(ctx, expr, indent);
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return [`${INDENT.repeat(indent)}| ${expr.text}`];
  }
  return [`${INDENT.repeat(indent)}| #{${renderExpr(ctx, expr)}}`];
}

/**
 * `<Suspense>` and `<ErrorBoundary>` become a `try` block with `pending` and
 * `catch` branches. An `ErrorBoundary` wrapping a `Suspense` collapses into one
 * `try` with both branches, which is the shape `beast-tsrx/examples/boundary`
 * uses. A `fallback` written as `(error, reset) => jsx` supplies the `catch`
 * bindings.
 */
function emitBoundaryBlock(ctx: ConvertContext, node: ts.JsxElement, indent: number): string[] | null {
  const name = tagName(ctx, node.openingElement.tagName);
  if (name !== "Suspense" && name !== "ErrorBoundary") return null;

  const pad = INDENT.repeat(indent);
  let content = meaningfulChildren(node.children);
  let pending: ts.Expression | null = null;
  let caught: ts.Expression | null = null;

  const own = getFallback(ctx, node.openingElement.attributes);
  if (name === "Suspense") {
    pending = own;
  } else {
    caught = own;
    // Unwrap a single nested Suspense so both branches land on one `try`.
    if (content.length === 1) {
      const [only] = content;
      if (ts.isJsxElement(only) && tagName(ctx, only.openingElement.tagName) === "Suspense") {
        pending = getFallback(ctx, only.openingElement.attributes);
        content = meaningfulChildren(only.children);
      }
    }
  }

  if (pending === null && caught === null) return null;

  const lines = [`${pad}try`];
  lines.push(...emitChildren(ctx, content, indent + 1));

  if (pending !== null) {
    lines.push(`${pad}pending`);
    lines.push(...emitFallbackBody(ctx, pending, indent + 1));
  }

  if (caught !== null) {
    const handler = unwrapParens(caught);
    if (ts.isArrowFunction(handler)) {
      const bindings = handler.parameters
        .filter((parameter) => ts.isIdentifier(parameter.name))
        .map((parameter) => parameter.name.getText(ctx.sourceFile));
      lines.push(bindings.length > 0 ? `${pad}catch ${bindings.join(", ")}` : `${pad}catch`);
      const returned = ts.isBlock(handler.body)
        ? (handler.body.statements.find(ts.isReturnStatement)?.expression ?? null)
        : handler.body;
      if (returned) lines.push(...emitFallbackBody(ctx, returned, indent + 1));
    } else {
      lines.push(`${pad}catch`);
      lines.push(...emitFallbackBody(ctx, handler, indent + 1));
    }
  }

  return lines;
}

/**
 * `<style>{`...`}</style>` becomes a `style` block carrying raw CSS. The CSS is
 * dedented to its own common indentation first, then re-indented under the
 * block, since indentation is structural in BTSX.
 */
function emitStyleBlock(ctx: ConvertContext, node: ts.JsxElement, indent: number): string[] | null {
  const children = meaningfulChildren(node.children);
  if (children.length !== 1) return null;

  const [child] = children;
  let css: string | null = null;
  if (ts.isJsxText(child)) css = child.text;
  else if (ts.isJsxExpression(child) && child.expression) {
    const expr = child.expression;
    if (ts.isNoSubstitutionTemplateLiteral(expr) || ts.isStringLiteral(expr)) css = expr.text;
  }
  if (css === null) return null;

  const lines = css.replace(/\t/gu, "  ").split("\n");
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  if (lines.length === 0) return null;

  const common = lines
    .filter((line) => line.trim() !== "")
    .reduce((min, line) => Math.min(min, line.length - line.trimStart().length), Infinity);
  const dedented = lines.map((line) => (line.trim() === "" ? "" : line.slice(common)));

  return [`${INDENT.repeat(indent)}style`, ...indentLines(dedented, indent + 1)];
}

function emitJsxElement(
  ctx: ConvertContext,
  node: ts.JsxElement,
  indent: number,
  omit?: ReadonlySet<string>
): string[] {
  const name = tagName(ctx, node.openingElement.tagName);

  if (name === "style") {
    const styleBlock = emitStyleBlock(ctx, node, indent);
    if (styleBlock !== null) return styleBlock;
  }

  const boundary = emitBoundaryBlock(ctx, node, indent);
  if (boundary !== null) return boundary;

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
  if (isSwitchIife(expr)) return false;
  return true;
}

function isSwitchIife(expr: ts.Expression): boolean {
  if (!ts.isCallExpression(expr) || expr.arguments.length !== 0) return false;
  const callee = unwrapParens(expr.expression);
  if (!ts.isArrowFunction(callee) && !ts.isFunctionExpression(callee)) return false;
  if (!ts.isBlock(callee.body)) return false;
  return callee.body.statements.length === 1 && ts.isSwitchStatement(callee.body.statements[0]);
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

  const switchBlock = emitSwitchBlock(ctx, expr, indent);
  if (switchBlock !== null) return switchBlock;

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

  // With a destructured binding the key expression usually references the
  // unpacked names, which are not in scope on the `each` line, so the key stays
  // an attribute (the form `beast-tsrx/examples/card` also uses).
  const keyText = info.destructure === null && info.body ? getKeyAttribute(ctx, info.body) : null;
  const lines = [`${pad}each ${info.bindings} in ${info.iterable}${keyText ? ` key ${keyText}` : ""}`];
  if (!info.body) return lines;

  if (info.destructure !== null) {
    lines.push(`${pad}${INDENT}scope`);
    lines.push(`${pad}${INDENT}${INDENT}setup ${info.destructure}`);
    lines.push(...emitElementOrExpression(ctx, info.body, indent + 2));
    return lines;
  }

  const omit = keyText ? new Set(["key"]) : undefined;
  lines.push(...emitElementOrExpression(ctx, info.body, indent + 1, omit));
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

interface IterationInfo {
  bindings: string;
  iterable: string;
  body: ts.Expression | null;
  /** Set when a callback parameter was a destructuring pattern. */
  destructure: string | null;
}

/** Picks a loop variable name that the callback body does not already use. */
function freshBindingName(ctx: ConvertContext, callback: ts.ArrowFunction | ts.FunctionExpression): string {
  const used = callback.getText(ctx.sourceFile);
  let name = "item";
  let suffix = 2;
  while (new RegExp(`\\b${name}\\b`, "u").test(used)) {
    name = `item${suffix}`;
    suffix += 1;
  }
  return name;
}

function getMapIterableInfo(ctx: ConvertContext, expr: ts.Expression): IterationInfo | null {
  const parts = getIterationParts(expr);
  if (!parts) return null;
  const { iterable: iterableArg, callback } = parts;

  // Beast requires one or two plain identifiers as loop bindings
  // (BEAST1402_INVALID_EACH_BINDING), so a destructuring pattern is bound to a
  // generated name and unpacked inside the body instead.
  let destructure: string | null = null;
  const params = callback.parameters.map((parameter) => {
    if (ts.isIdentifier(parameter.name)) return parameter.name.text;
    const generated = freshBindingName(ctx, callback);
    const pattern = requoteSource(ctx, parameter.name);
    destructure = `const ${pattern} = ${generated};`;
    return generated;
  });
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

  return { bindings, iterable, body, destructure };
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
