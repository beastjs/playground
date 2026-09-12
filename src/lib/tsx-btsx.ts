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
 * The same, for an expression that will end up inside an attribute or a
 * `#{...}` interpolation. Those are joined back into a single logical line, so
 * a `// ...` comment would swallow whatever followed it — this printer drops
 * comments instead.
 */
function requoteExpression(ctx: ConvertContext, node: ts.Node): string {
  const text = ctx.exprPrinter.printNode(ts.EmitHint.Unspecified, node, ctx.sourceFile);
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
  /** Printer for expressions that have to survive being joined onto one line. */
  exprPrinter: ts.Printer;
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
  /** Every name the file declares at module scope, so a lifted render prop
   * can tell what it closed over from what is simply in scope. */
  moduleScope: Set<string>;
  /** Module-scope names in use, including the ones this conversion generates. */
  takenNames: Set<string>;
  /** `component` blocks lifted out of render props, awaiting emission. */
  lifted: string[][];
  /**
   * React names the conversion handles by rewriting every use of them, so
   * losing the import is the point rather than a gap worth reporting.
   */
  unwrappedReact: Set<string>;
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
  const exprPrinter = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true });
  const moduleScope = collectModuleScope(sourceFile.statements);
  const ctx: ConvertContext = {
    sourceFile,
    printer,
    exprPrinter,
    sourceText: source,
    reactTypes: new Map(),
    octaneTypeImports: new Map(),
    octaneImports: new Map(),
    moduleScope,
    takenNames: new Set(moduleScope),
    lifted: [],
    unwrappedReact: collectUnwrappedReact(sourceFile)
  };

  const rootIndex = findRootComponentIndex(sourceFile.statements);

  // BTSX is written in one order regardless of the order TSX was written in:
  // every declaration first, then the file's own template. Beast enforces it
  // (BEAST1503_MISPLACED_DECLARATION), and a `const` collecting the exports —
  // the one declaration TSX conventionally puts at the bottom — is exactly what
  // the rule catches. So the sections are gathered separately here and
  // assembled at the end.
  const directive: string[] = [];
  const imports: string[] = [];
  const moduleMembers: string[] = [];
  const components: string[] = [];
  const root: string[] = [];

  const statements = sourceFile.statements;
  for (let idx = 0; idx < statements.length; idx++) {
    const statement = statements[idx];
    const leadingComment = getLeadingLineComment(ctx, statement);

    if (ts.isImportDeclaration(statement)) {
      if (leadingComment !== null) imports.push(leadingComment);
      imports.push(...renderImportDeclaration(ctx, statement));
      continue;
    }

    const component = getComponentDeclaration(statement);
    if (component) {
      const rendered = renderFunctionComponent(
        ctx,
        component.fn,
        component.name,
        idx === rootIndex,
        component.forwarded
      );
      const target = idx === rootIndex ? root : components;
      if (leadingComment !== null) target.push(leadingComment);
      target.push(...rendered);
      continue;
    }

    // A directive is the one piece of module code that has to precede the
    // imports, exactly as it would in TSRX, or it stops being a directive.
    if (moduleMembers.length === 0 && isDirective(statement)) {
      directive.push(`module ${ensureSemicolon(requoteSource(ctx, statement))}`);
      continue;
    }

    // type alias / interface / variable statement / anything else declarative
    if (leadingComment !== null) moduleMembers.push(leadingComment);
    moduleMembers.push(...renderModuleMember(ctx, statement));
  }

  // The file's own component loses its name on the way out: Beast names the
  // default export after the file. Module code that referred to it by name —
  // an exports barrel naming every component in the file — silently stops
  // resolving, so the reference is called out where it is written.
  const rootName = rootIndex >= 0 ? getComponentDeclaration(statements[rootIndex])?.name : undefined;
  if (rootName !== undefined && rootName !== "Anonymous") {
    const mentions = new RegExp(`\\b${rootName}\\b`, "u");
    const at = moduleMembers.findIndex((line) => mentions.test(line));
    if (at >= 0) {
      const indent = moduleMembers[at].slice(0, moduleMembers[at].length - moduleMembers[at].trimStart().length);
      moduleMembers.splice(
        at,
        0,
        `${indent}// ${rootName} is this file's own component, and Beast names that one after the file — this reference will not resolve`
      );
    }
  }

  // Octane's own imports are written last, because what a conversion needs is
  // only known once every annotation and statement has been rendered — a
  // `React.useState` deep in the body pulls in an import of its own. They still
  // belong with the imports the file wrote.
  for (const [module, names] of ctx.octaneImports) {
    imports.push(`import { ${[...names.values()].join(", ")} } from "${module}";`);
  }
  if (ctx.octaneTypeImports.size > 0) {
    imports.push(`import type { ${[...ctx.octaneTypeImports.values()].join(", ")} } from "octane";`);
  }

  const outputLines = [...directive, ...imports];
  if (moduleMembers.length > 0) {
    outputLines.push("module");
    outputLines.push(...indentLines(moduleMembers, 1));
  }
  outputLines.push(...components, ...root);

  return outputLines.join("\n") + "\n";
}

/**
 * The React names this conversion rewrites rather than imports. `forwardRef`
 * qualifies only when every reference to it in the file is a call being
 * unwrapped — one left over anywhere else still needs reporting, because the
 * import is going away either way.
 */
function collectUnwrappedReact(sourceFile: ts.SourceFile): Set<string> {
  const unwrapped = new Set<string>();

  let unwrappedCalls = 0;
  for (const statement of sourceFile.statements) {
    if (getComponentDeclaration(statement)?.forwarded) unwrappedCalls += 1;
  }
  if (unwrappedCalls > 0 && unwrappedCalls === countReferences(sourceFile, "forwardRef")) {
    unwrapped.add("forwardRef");
  }
  return unwrapped;
}

/** How many times a name is used outside the imports that bind it. */
function countReferences(sourceFile: ts.SourceFile, name: string): number {
  let count = 0;
  const walk = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name) count += 1;
    node.forEachChild(walk);
  };
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) continue;
    walk(statement);
  }
  return count;
}

/** `"use client"` and friends: a string literal standing alone as a statement. */
function isDirective(statement: ts.Statement): boolean {
  return ts.isExpressionStatement(statement) && ts.isStringLiteralLike(statement.expression);
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
  const isTypeOnlyClause = clause.phaseModifier === ts.SyntaxKind.TypeKeyword;
  if (isTypeOnlyClause && !isReact) return [];
  // `import defer` is the other phase a clause can carry. It changes when the
  // module is evaluated, so it has to survive the rewrite.
  const phase = clause.phaseModifier === ts.SyntaxKind.DeferKeyword ? "defer " : "";

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
    const isType = isTypeOnlyClause || el.isTypeOnly;

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
      // A name the conversion rewrites away is not a gap: `forwardRef` has no
      // Octane equivalent because Octane needs none, and every call to it was
      // unwrapped into a component that takes `ref` as a prop.
      if (!ctx.unwrappedReact.has(local)) dropped.push(local);
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
    lines.push(`import ${phase}${parts.join(", ")} from ${quote(moduleTarget)};`);
  }
  for (const [target, names] of groups) {
    lines.push(`import ${phase}{ ${names.join(", ")} } from ${quote(target)};`);
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
  // A plain helper function — anything not named like a component — is declared
  // as written. Its body already ends in `}`, so no semicolon is added.
  if (ts.isFunctionDeclaration(statement)) {
    return reindent(toLines(requoteSource(ctx, statement)));
  }
  // const/let/var and anything else: print + requote + ensure semicolon.
  const text = requoteSource(ctx, statement);
  return reindent(toLines(ensureSemicolon(text)));
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

/**
 * Rewrites the TypeScript printer's four-space body indentation to the
 * two-space `INDENT` the rest of the output uses, so a multi-line declaration
 * nested in a `module` block lines up with everything around it.
 */
function reindent(lines: string[]): string[] {
  return lines.map((line) => {
    const body = line.trimStart();
    if (body.length === 0) return "";
    const depth = (line.length - body.length) / 4;
    if (!Number.isInteger(depth)) return line;
    return INDENT.repeat(depth) + body;
  });
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
    reindent(toLines(renderSetupStatement(ctx, stmt)))
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

/**
 * One hoisted statement as it is written in `setup`. A statement whose own
 * syntax already closes it — a function, an `if`, a loop, a `try` — takes no
 * semicolon; a declaration or expression statement does.
 */
function renderSetupStatement(ctx: ConvertContext, statement: ts.Statement): string {
  const text = requoteSource(ctx, statement);
  if (endsWithBlock(statement)) return text;
  return ensureSemicolon(text);
}

function endsWithBlock(statement: ts.Statement): boolean {
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
  );
}

type ComponentFn = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

/** A `forwardRef(...)` call the conversion unwraps into a plain component. */
interface ForwardedRef {
  fn: ts.ArrowFunction | ts.FunctionExpression;
  /** The second parameter, which becomes the `ref` prop. */
  refParameter: ts.ParameterDeclaration;
  /** `forwardRef<HTMLElement, Props>`: the element type, then the props type. */
  typeArguments: ts.NodeArray<ts.TypeNode> | undefined;
}

interface ComponentDeclaration {
  name: string;
  fn: ComponentFn;
  forwarded?: ForwardedRef;
}

/**
 * JSX resolves a lowercase tag to an HTML element, so only a capitalized name
 * can ever be used as a component. A `useGroupContext` or a `formatLabel` is a
 * plain function that happens to live beside the components, and belongs in
 * `module` as written.
 */
function isComponentName(name: string): boolean {
  return /^[A-Z]/u.test(name);
}

/**
 * Detects the top-level declarations that become `component` blocks:
 * `function Foo() { ... }`, `const Foo = (props) => <jsx/>` and
 * `const Foo = function () { ... }`. A function has to be named like a
 * component, and an initializer has to actually return JSX — everything else
 * stays an ordinary `module` declaration.
 */
function getComponentDeclaration(statement: ts.Statement): ComponentDeclaration | null {
  if (ts.isFunctionDeclaration(statement)) {
    // A default-exported component may be anonymous, in which case there is no
    // name to judge and the export itself says it is the file's component.
    const name = statement.name ? statement.name.text : "Anonymous";
    if (statement.name && !isComponentName(name)) return null;
    return { name, fn: statement };
  }

  // `export default forwardRef(...)`: the file's own component, written as the
  // wrapper's return value rather than as a declaration.
  if (ts.isExportAssignment(statement)) {
    if (statement.isExportEquals) return null;
    const forwarded = getForwardRefCall(statement.expression);
    if (!forwarded) return null;
    const inner = forwarded.fn;
    const name = ts.isFunctionExpression(inner) && inner.name ? inner.name.text : "Anonymous";
    return { name, fn: inner, forwarded };
  }

  if (!ts.isVariableStatement(statement)) return null;
  const declarations = statement.declarationList.declarations;
  if (declarations.length !== 1) return null;

  const [declaration] = declarations;
  if (!ts.isIdentifier(declaration.name)) return null;
  if (!isComponentName(declaration.name.text)) return null;

  const init = declaration.initializer;
  if (!init) return null;

  const forwarded = getForwardRefCall(init);
  if (forwarded) return { name: declaration.name.text, fn: forwarded.fn, forwarded };

  if (!ts.isArrowFunction(init) && !ts.isFunctionExpression(init)) return null;
  if (!returnsJsx(init)) return null;

  return { name: declaration.name.text, fn: init };
}

/**
 * `forwardRef((props, ref) => jsx)` — the wrapper Octane has no equivalent for,
 * because a ref is an ordinary prop there and nothing needs forwarding
 * (`beast-tsrx/examples/refs`). The call is unwrapped: the function inside is
 * the component, and its second parameter rejoins the first as a `ref` prop.
 */
function getForwardRefCall(expression: ts.Expression): ForwardedRef | null {
  const call = unwrapParens(expression);
  if (!ts.isCallExpression(call) || call.arguments.length !== 1) return null;

  const callee = call.expression;
  const isForwardRef = ts.isIdentifier(callee)
    ? callee.text === "forwardRef"
    : ts.isPropertyAccessExpression(callee) && callee.name.text === "forwardRef";
  if (!isForwardRef) return null;

  const [fn] = call.arguments;
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return null;
  if (fn.parameters.length !== 2) return null;

  const [, refParameter] = fn.parameters;
  if (!ts.isIdentifier(refParameter.name)) return null;

  return { fn, refParameter, typeArguments: call.typeArguments };
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
    const declaration = getComponentDeclaration(statement);
    if (!declaration) continue;
    // An unwrapped `forwardRef` always takes props: the ref is one of them.
    if (!declaration.forwarded && !getRootPropsParam(declaration.fn)) continue;

    if (hasDefaultExport(statement)) return i;
    fallback = i;
  }

  return fallback;
}

function hasDefaultExport(statement: ts.Statement): boolean {
  if (ts.isExportAssignment(statement)) return !statement.isExportEquals;
  const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
}

function renderFunctionComponent(
  ctx: ConvertContext,
  fn: ComponentFn,
  name: string,
  isRoot: boolean,
  forwarded?: ForwardedRef
): string[] {
  if (fn.body === undefined) return [];

  const rootParam = forwarded ? null : getRootPropsParam(fn);

  // An arrow function with a concise body has no statements to hoist into
  // `setup` lines — its whole body is the returned expression.
  const { setupStatements, returnExpr } = ts.isBlock(fn.body)
    ? splitBody(fn.body)
    : { setupStatements: [] as ts.Statement[], returnExpr: fn.body as ts.Expression };

  const body: string[] = [];
  const notes: string[] = [];
  if (rootParam) body.push(`props ${renderRootPropsHeader(ctx, rootParam)}`);
  if (forwarded) {
    const header = renderForwardedPropsHeader(ctx, forwarded);
    body.push(`props ${header.text}`);
    if (!header.typed) {
      notes.push(`// ${name} forwarded a ref; give its props a type that includes ref`);
    }
  }
  body.push(...renderSetupBlock(ctx, setupStatements));
  // Rendering the template is what lifts render props out of it, so the blocks
  // they became are only known now. They are declarations, and every
  // declaration has to precede the first template line
  // (BEAST1503_MISPLACED_DECLARATION), so they go out ahead of this component.
  if (returnExpr) body.push(...emitRootJsx(ctx, returnExpr));
  const declarations = ctx.lifted.splice(0, ctx.lifted.length).flat();

  // The file's own component sits at column zero; every other one is a named
  // `component` block with its props nested inside it.
  if (isRoot) return [...declarations, ...notes, ...body];
  return [...declarations, ...notes, `component ${name}`, ...indentLines(body, 1)];
}

/**
 * The `props` line for an unwrapped `forwardRef`. The two parameters become
 * one: the ref joins the props it was separated from, ahead of any rest
 * element, which has to stay last to be a valid binding pattern — and ahead of
 * it is also where it belongs, since `forwardRef` kept the ref out of the rest.
 */
function renderForwardedPropsHeader(
  ctx: ConvertContext,
  forwarded: ForwardedRef
): { text: string; typed: boolean } {
  const refName = forwarded.refParameter.name.getText(ctx.sourceFile);
  const [propsParameter] = forwarded.fn.parameters;

  const bindings: string[] = [];
  let rest: string | null = null;
  if (ts.isObjectBindingPattern(propsParameter.name)) {
    for (const element of propsParameter.name.elements) {
      const text = requoteSource(ctx, element);
      if (element.dotDotDotToken) rest = text;
      else bindings.push(text);
    }
  } else {
    // A whole-object parameter keeps working as one: the ref is named out of it
    // and everything else rests back into the name the body already uses.
    rest = `...${propsParameter.name.getText(ctx.sourceFile)}`;
  }
  bindings.push(refName);
  if (rest !== null) bindings.push(rest);

  const pattern = `{ ${bindings.join(", ")} }`;
  const annotation = renderForwardedPropsType(ctx, forwarded, refName);
  if (annotation === null) return { text: pattern, typed: false };
  return { text: `${pattern}: ${annotation}`, typed: true };
}

/**
 * `forwardRef<HTMLElement, Props>` states both halves of the type it needs:
 * the props, and what the ref points at. Without the type arguments the
 * parameters' own annotations are the next best source, and with neither there
 * is nothing to write.
 */
function renderForwardedPropsType(
  ctx: ConvertContext,
  forwarded: ForwardedRef,
  refName: string
): string | null {
  const args = forwarded.typeArguments;
  if (args && args.length === 2) {
    const element = renderTypeInline(ctx, args[0]);
    const props = renderTypeInline(ctx, args[1]);
    return `${props} & { ${refName}: ${octaneRefType(ctx, element)} }`;
  }

  const [propsParameter] = forwarded.fn.parameters;
  if (!propsParameter.type) return null;
  const props = renderTypeInline(ctx, propsParameter.type);
  const ref = forwarded.refParameter.type
    ? renderTypeInline(ctx, forwarded.refParameter.type)
    : octaneRefType(ctx, "unknown");
  return `${props} & { ${refName}: ${ref} }`;
}

/** `createElement`, recording the import it needs from Octane. */
function octaneCreateElement(ctx: ConvertContext): string {
  const module = resolveReactExport("react", "createElement");
  if (module === null) return "createElement";
  addOctaneImport(ctx, module, "createElement");
  return "createElement";
}

/** `Ref<T>`, recording the import it needs from Octane. */
function octaneRefType(ctx: ConvertContext, element: string): string {
  const octane = resolveReactType("Ref");
  if (octane === null) return `unknown`;
  ctx.octaneTypeImports.set(octane, octane);
  return `${octane}<${element}>`;
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

/** ---------- render props ---------- */

/**
 * Names that are always in scope, so a reference to one is never something the
 * enclosing component owns.
 */
const AMBIENT_NAMES: ReadonlySet<string> = new Set([
  "globalThis", "window", "document", "navigator", "location", "history", "console",
  "Math", "JSON", "Object", "Array", "String", "Number", "Boolean", "Symbol", "BigInt",
  "Date", "RegExp", "Error", "TypeError", "Promise", "Map", "Set", "WeakMap", "WeakSet",
  "Intl", "URL", "URLSearchParams", "Infinity", "NaN", "undefined",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame",
  "cancelAnimationFrame", "queueMicrotask", "structuredClone", "fetch", "parseInt",
  "parseFloat", "isNaN", "isFinite", "encodeURIComponent", "decodeURIComponent"
]);

/** True for `<div>` / `<path>` — a tag the runtime resolves, not a reference. */
function isIntrinsicTag(tagName: ts.JsxTagNameExpression): boolean {
  return ts.isIdentifier(tagName) && isHtmlTagName(tagName.text);
}

/** Every name a binding pattern or identifier introduces. */
function collectBoundNames(name: ts.BindingName, into: Set<string>): void {
  if (ts.isIdentifier(name)) {
    into.add(name.text);
    return;
  }
  for (const element of name.elements) {
    if (ts.isOmittedExpression(element)) continue;
    collectBoundNames(element.name, into);
  }
}

/** The names a list of statements declares, collected before any is visited. */
function declaredNames(statements: readonly ts.Statement[]): Set<string> {
  const names = new Set<string>();
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBoundNames(declaration.name, names);
      }
      continue;
    }
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      names.add(statement.name.text);
    }
  }
  return names;
}

/** The names one function's parameters bind. */
function parameterNames(parameters: readonly ts.ParameterDeclaration[]): Set<string> {
  const names = new Set<string>();
  for (const parameter of parameters) collectBoundNames(parameter.name, names);
  return names;
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
function collectFreeNames(ctx: ConvertContext, fn: ts.ArrowFunction | ts.FunctionExpression): string[] {
  const free: string[] = [];
  const seen = new Set<string>();

  const reference = (name: string, bound: ReadonlySet<string>): void => {
    if (bound.has(name) || seen.has(name)) return;
    if (ctx.moduleScope.has(name) || AMBIENT_NAMES.has(name)) return;
    seen.add(name);
    free.push(name);
  };

  const walk = (node: ts.Node, bound: ReadonlySet<string>): void => {
    // A type never becomes a prop: it resolves where the component is written.
    if (ts.isTypeNode(node) || ts.isTypeParameterDeclaration(node)) return;

    if (ts.isIdentifier(node)) {
      reference(node.text, bound);
      return;
    }

    if (ts.isPropertyAccessExpression(node)) {
      walk(node.expression, bound);
      return;
    }
    if (ts.isQualifiedName(node)) return;

    if (ts.isPropertyAssignment(node)) {
      if (ts.isComputedPropertyName(node.name)) walk(node.name.expression, bound);
      walk(node.initializer, bound);
      return;
    }
    if (ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
      const inner = new Set([...bound, ...parameterNames(node.parameters)]);
      if (node.body) walk(node.body, inner);
      return;
    }
    if (ts.isJsxAttribute(node)) {
      if (node.initializer) walk(node.initializer, bound);
      return;
    }
    // `<li>` names an HTML element, not a value in scope; `<Popup>` does name
    // one. The closing tag repeats whichever it was.
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (!isIntrinsicTag(node.tagName)) walk(node.tagName, bound);
      walk(node.attributes, bound);
      return;
    }
    if (ts.isJsxClosingElement(node)) return;
    if (ts.isBindingElement(node)) {
      // `{ a: b = fallback }` reads `fallback`; `a` and `b` are not reads.
      if (node.initializer) walk(node.initializer, bound);
      if (!ts.isIdentifier(node.name)) walk(node.name, bound);
      return;
    }

    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
      const inner = new Set([...bound, ...parameterNames(node.parameters)]);
      if (node.name && ts.isIdentifier(node.name)) inner.add(node.name.text);
      for (const parameter of node.parameters) {
        if (parameter.initializer) walk(parameter.initializer, bound);
      }
      if (node.body) walk(node.body, inner);
      return;
    }

    if (ts.isBlock(node) || ts.isCaseClause(node) || ts.isDefaultClause(node)) {
      const inner = new Set([...bound, ...declaredNames(node.statements)]);
      for (const statement of node.statements) walk(statement, inner);
      return;
    }

    if (ts.isVariableDeclaration(node)) {
      // The declared names are already in scope for this statement list; only
      // the initializer and a destructuring default are reads.
      if (!ts.isIdentifier(node.name)) walk(node.name, bound);
      if (node.initializer) walk(node.initializer, bound);
      return;
    }

    if (ts.isCatchClause(node)) {
      const inner = new Set(bound);
      if (node.variableDeclaration) collectBoundNames(node.variableDeclaration.name, inner);
      walk(node.block, inner);
      return;
    }

    if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      const inner = new Set(bound);
      const initializer = ts.isForStatement(node) ? node.initializer : node.initializer;
      if (initializer && ts.isVariableDeclarationList(initializer)) {
        for (const declaration of initializer.declarations) collectBoundNames(declaration.name, inner);
      }
      node.forEachChild((child) => walk(child, inner));
      return;
    }

    node.forEachChild((child) => walk(child, bound));
  };

  const bound = new Set(parameterNames(fn.parameters));
  for (const parameter of fn.parameters) {
    if (parameter.initializer) walk(parameter.initializer, new Set());
  }
  walk(fn.body, bound);
  return free;
}

/** Every name the file itself declares at module scope, imports included. */
function collectModuleScope(statements: ts.NodeArray<ts.Statement>): Set<string> {
  const names = new Set<string>();
  for (const statement of statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (!clause) continue;
      if (clause.name) names.add(clause.name.text);
      const bindings = clause.namedBindings;
      if (!bindings) continue;
      if (ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
      else for (const element of bindings.elements) names.add(element.name.text);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        collectBoundNames(declaration.name, names);
      }
      continue;
    }
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement)) &&
      statement.name
    ) {
      names.add(statement.name.text);
    }
  }
  return names;
}

/** A name for a generated component that nothing in the file already uses. */
function uniqueComponentName(ctx: ConvertContext, base: string): string {
  const cleaned = base.replace(/[^A-Za-z0-9]/gu, "") || "Render";
  let name = `${cleaned}Children`;
  let suffix = 2;
  while (ctx.takenNames.has(name)) {
    name = `${cleaned}Children${suffix}`;
    suffix += 1;
  }
  ctx.takenNames.add(name);
  return name;
}

/** A parameter name for the call site that collides with nothing it mentions. */
function freshParameterName(taken: ReadonlySet<string>): string {
  let name = "state";
  let suffix = 2;
  while (taken.has(name)) {
    name = `state${suffix}`;
    suffix += 1;
  }
  return name;
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
function liftRenderProp(
  ctx: ConvertContext,
  tag: string,
  fn: ts.ArrowFunction | ts.FunctionExpression
): string | null {
  if (!returnsJsx(fn)) return null;
  if (fn.parameters.length > 1) return null;

  const [parameter] = fn.parameters;
  const isPattern = parameter !== undefined && ts.isObjectBindingPattern(parameter.name);
  const isIdentifier = parameter !== undefined && ts.isIdentifier(parameter.name);
  if (parameter !== undefined && !isPattern && !isIdentifier) return null;

  const captures = collectFreeNames(ctx, fn);
  const name = uniqueComponentName(ctx, tag);

  // The generated component's own parameter: what the render prop destructured,
  // widened with the names it used to close over.
  const bindings: string[] = [];
  if (parameter && isPattern) {
    const pattern = requoteSource(ctx, parameter.name).trim();
    const inner = pattern.slice(1, -1).trim();
    if (inner.length > 0) bindings.push(inner);
  } else if (parameter && isIdentifier) {
    bindings.push(parameter.name.getText(ctx.sourceFile));
  }
  bindings.push(...captures);

  // The parameter's own annotation carries over when nothing was captured. Once
  // captures widen the parameter there is no type left to write: their types
  // live in the component this was lifted out of, which is not in scope here.
  const annotation =
    parameter && parameter.type && captures.length === 0
      ? `: ${renderTypeInline(ctx, parameter.type)}`
      : "";

  const body: string[] = [];
  if (bindings.length > 0) body.push(`props { ${bindings.join(", ")} }${annotation}`);
  const { setupStatements, returnExpr } = ts.isBlock(fn.body)
    ? splitBody(fn.body)
    : { setupStatements: [] as ts.Statement[], returnExpr: fn.body as ts.Expression };
  body.push(...renderSetupBlock(ctx, setupStatements));
  if (returnExpr) body.push(...emitRootJsx(ctx, returnExpr));

  const notes = [
    captures.length > 0
      ? `// lifted from the ${tag} render prop; ${captures.join(", ")} came from the component around it`
      : `// lifted from the ${tag} render prop`
  ];
  if (bindings.length > 0 && annotation === "") {
    notes.push("// its props type is the one thing the conversion cannot infer — annotate it");
  }
  ctx.lifted.push([...notes, `component ${name}`, ...indentLines(body, 1)]);

  // A destructuring render prop that captured nothing is already shaped like a
  // component: the state object it unpacks *is* the props object.
  // The element has to be *created*, never called. A compiled component takes
  // the runtime's own arguments beside its props, so invoking it directly from
  // the render prop leaves those undefined and it dies reading its block.
  const create = octaneCreateElement(ctx);

  if (parameter && isIdentifier) {
    const argument = parameter.name.getText(ctx.sourceFile);
    return `children={(${argument}) => ${create}(${name}, { ${[argument, ...captures].join(", ")} })}`;
  }
  if (parameter && isPattern) {
    const argument = freshParameterName(new Set([...captures, ...ctx.takenNames]));
    // A destructuring render prop that captured nothing is already shaped like
    // a component: the state object it unpacks is the props object.
    const props = captures.length === 0 ? argument : `{ ...${argument}, ${captures.join(", ")} }`;
    return `children={(${argument}) => ${create}(${name}, ${props})}`;
  }
  if (captures.length === 0) return `children={() => ${create}(${name}, {})}`;
  return `children={() => ${create}(${name}, { ${captures.join(", ")} })}`;
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
  return pipeExpression(renderExpr(ctx, node), indent);
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
  return requoteExpression(ctx, expr);
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

  // An attribute whose value printed across several lines — an event handler
  // with a block body, a render prop — has no single-line form to fall back to:
  // every one of its lines has to become a continuation, or the tail lands in
  // the template as markup and the attribute list is never closed
  // (BEAST1201_UNCLOSED_ATTRIBUTES).
  const spansLines = rest.some((attr) => attr.includes("\n"));
  const singleLine = `${pad}${selector}(${rest.join(" ")})`;
  if (!spansLines && (singleLine.length <= MAX_TAG_LINE || rest.length < 2)) return [singleLine];

  const contPad = INDENT.repeat(indent + 1);
  const lines = [`${pad}${selector}(`];
  for (const attr of rest) lines.push(...continuationLines(attr, contPad));
  lines.push(`${contPad}~ )`);
  return lines;
}

/**
 * Splits one printed fragment into `~` continuation lines. Beast rejoins them
 * with a single space, so each line is trimmed and blank lines are dropped —
 * what comes back is the fragment as one logical line.
 */
function continuationLines(text: string, pad: string): string[] {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) lines.push(`${pad}~ ${trimmed}`);
  }
  return lines;
}

/**
 * Emits `| #{expr}` pipe text, continuing onto `~` lines when the expression
 * printed across several of them.
 */
function pipeExpression(text: string, indent: number): string[] {
  const pad = INDENT.repeat(indent);
  const [first, ...rest] = text.split("\n");
  if (rest.length === 0) return [`${pad}| #{${text}}`];
  return [
    `${pad}| #{${first.trim()}`,
    ...continuationLines(rest.join("\n"), INDENT.repeat(indent + 1)),
    `${INDENT.repeat(indent + 1)}~ }`
  ];
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
  return pipeExpression(renderExpr(ctx, expr), indent);
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

  const meaningful = meaningfulChildren(node.children);

  // A render prop is the child the template cannot own: the element calls it,
  // with arguments only it has. It goes back to being what it already is — the
  // `children` prop — written last so it keeps winning over any spread, the
  // same precedence JSX children have.
  const render = getRenderPropChild(meaningful);
  if (render) {
    attrs.rest.push(renderPropAttribute(ctx, name, render));
    return buildTagLines(name, isHtml, attrs, indent);
  }

  const tagLines = buildTagLines(name, isHtml, attrs, indent);
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

/**
 * `<Root>{(state) => <jsx/>}</Root>`: children given as a function the element
 * invokes itself. BTSX has no block form for one — a block is a subtree, and
 * this is a callback whose parameters only exist inside the call — so the
 * function stays a TypeScript expression, which is where a render prop is
 * least surprising anyway.
 */
function getRenderPropChild(
  children: ts.JsxChild[]
): ts.ArrowFunction | ts.FunctionExpression | null {
  if (children.length !== 1) return null;
  const [only] = children;
  if (!ts.isJsxExpression(only) || !only.expression) return null;
  const expr = unwrapParens(only.expression);
  if (!ts.isArrowFunction(expr) && !ts.isFunctionExpression(expr)) return null;
  return expr;
}

/**
 * The `children` attribute a render prop becomes. One that returns JSX is
 * lifted into a `component` block so its markup is converted like any other;
 * one that returns anything else — a string, a number, an element the caller
 * built — has no template to lift and stays the expression it was.
 */
function renderPropAttribute(
  ctx: ConvertContext,
  tag: string,
  fn: ts.ArrowFunction | ts.FunctionExpression
): string {
  const lifted = liftRenderProp(ctx, tag, fn);
  if (lifted !== null) return lifted;
  return `children={${renderExpr(ctx, fn)}}`;
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
  return pipeExpression(renderExpr(ctx, expr), indent);
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

  // `cond ? undefined : <A/>` is a one-armed `if` written inside out — the
  // branch that renders is the false one, so the condition is negated and the
  // empty arm disappears rather than becoming a line that renders nothing.
  const whenTrue = unwrapParens(expr.whenTrue);
  const whenFalse = unwrapParens(expr.whenFalse);
  if (isNullish(whenTrue) && !isNullish(whenFalse)) {
    return [
      `${pad}${keyword} !(${renderExpr(ctx, expr.condition)})`,
      ...emitElementOrExpression(ctx, whenFalse, indent + 1)
    ];
  }

  const lines: string[] = [`${pad}${keyword} ${renderExpr(ctx, expr.condition)}`];
  lines.push(...emitElementOrExpression(ctx, whenTrue, indent + 1));

  const otherwise = whenFalse;
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
