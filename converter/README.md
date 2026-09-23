# tsxToBtsx

`convertTsxToBtsx(source: string): string` — converts a `.tsx` source string into
the `.btsx` template syntax, using the real TypeScript AST (via the `typescript`
compiler API) rather than regex, so it handles nesting, quoting, and expressions
correctly instead of guessing at string patterns.

```ts
import { convertTsx, convertTsxToBtsx, BtsxConversionError } from "../src/lib/tsx-btsx";

try {
  const btsx = convertTsxToBtsx(tsxSource);

  // Or, with a report of anything the output could not carry over:
  const { code, diagnostics } = convertTsx(tsxSource);
  for (const d of diagnostics) console.warn(`${d.line}:${d.column} [${d.code}] ${d.message}`);
} catch (error) {
  if (error instanceof BtsxConversionError) console.error(error.diagnostics);
}
```

A conversion that compiles can still have lost something — a boundary prop
with nowhere to go, an early return with no template form. Rather than letting
that surface at runtime, `convertTsx` returns a `diagnostics` list naming each
one with its position in the TSX. The codes are a closed union
(`ConversionDiagnosticCode`), so a caller can decide which ones matter:

| code | meaning |
| --- | --- |
| `dropped-import` | a React import with no Octane counterpart was removed |
| `unresolved-react-member` | a `React.Name` with no counterpart still refers to React |
| `unconverted-early-return` | a `return` inside a loop, `try` or fall-through `if` was left in `setup` |
| `unconverted-switch-case` | a `switch` arm that does not end in a return renders nothing |
| `dropped-boundary-prop` | a `<Suspense>` / `<ErrorBoundary>` prop other than `fallback` was dropped |
| `reevaluated-iterable` | a `.map` callback's array parameter is re-read from a non-trivial expression |
| `dropped-overload` | a component overload signature was removed |
| `untyped-props` | a lifted or unwrapped component's props could not be typed |
| `native-change-handler` | a text-field `onChange` needs review because its type or handlers are ambiguous |

The playground shows them as a warning badge on the BTSX panel.

The TypeScript parser is error-tolerant and will happily return a tree full of
garbage for garbage input. `convertTsxToBtsx` checks the parse diagnostics up
front and throws `BtsxConversionError` (carrying `line:col message` strings in
`.diagnostics`) rather than emitting a nonsensical conversion.

Requires the `typescript` package as a dependency (`npm install typescript`).
Written in strict TypeScript — no `any`.

## Rules implemented (reverse-engineered from the example)

**Native input events**
- Text inputs and textareas convert `onChange` to `onInput` to preserve React's
  per-edit updates. Non-text controls and component callbacks retain `onChange`.
- `suppressNativeChangeWarning` preserves an intentional native change handler.
  Spreads, dynamic input types, and an existing `onInput` make rewriting
  ambiguous; the converter retains the handler and reports `native-change-handler`.

**Top level**
- The `// comment` lines directly preceding a statement are reproduced as-is,
  however many consecutive lines the comment runs to. A blank line ends the
  run; a comment above it belongs to something else.
- React imports resolve to Octane's corresponding value and type exports.
  Other type-only imports and inline `type` specifiers are preserved, including
  signal types and application props. Quotes are doubled and a semicolon is added.
  Default (`import React from 'x'`), namespace (`import * as ns from 'x'`),
  combined (`import R, { a } from 'x'`) and bare side-effect (`import './a.css'`)
  imports are all preserved — except `import Link from "next/link"`, which
  becomes `import { Link } from "@octanejs/tanstack-router"` (a different local
  name is kept as an alias). The clause's phase is
  read from `phaseModifier` (`ImportClause.isTypeOnly` is deprecated), so the
  other phase it can carry, `import defer * as ns from "..."`, is preserved
  rather than quietly emitted as an eager import — it decides when the module
  evaluates. `ImportSpecifier.isTypeOnly`, the per-name `{ type B }` flag, is
  not deprecated and is still read directly.
- Output order is fixed, whatever order the TSX was written in: a module
  directive, then the imports, then one `module` block with every top-level
  `type` / `interface` / `const`/`let`/`var` declaration in source order
  (2-space indented), then the `component` blocks, and last the file's own
  template. Beast requires it — module code, imports, components, `props` and
  `setup` must all precede template content (`BEAST1503_MISPLACED_DECLARATION`)
  — and the declaration TSX conventionally writes at the *bottom* of a file,
  the `const` collecting the exports, is exactly what that rule rejects. Moving
  it up is safe: a `component` block compiles to a hoisted function
  declaration, so an exports barrel above it still resolves. A `type` or
  `interface` that spans lines keeps its first line and continues every other
  line — members and the closing brace — on `~` lines. A `ReactNode` (or
  `React.ReactNode`) type becomes `OctaneNode`, imported from `octane`.
- An inline object type is written on one line with every member kept:
  properties (with `readonly`), methods, and call and index signatures.
- Printed statements are re-indented from the TypeScript printer's four spaces
  to two, except inside a template literal, where whitespace is part of the
  value. Beast strips only the block indent it added, so a `sql` or `css`
  template reaches TSRX unchanged.
- Every rewrite of printed code — requoting strings, renaming React types,
  resolving `React.useState`, renaming the file's component — happens on the
  AST, never on the printed text. A string, a comment or a line of JSX text that
  happens to spell one of those names is left alone.
- `"use client"` and any other directive is emitted as `module "use client";`
  *before* the imports, where a directive has to stay to remain one.
- Only a function whose name is capitalized is a component. JSX resolves a
  lowercase tag to an HTML element, so a hook or a helper — `useGroupContext`,
  `formatLabel` — can never be one: it is declared as written inside `module`,
  body and all, and joins the surrounding declarations instead of being flushed
  between them. An anonymous `export default function` is exempt, since the
  export itself says it is the file's component.

  ```btsx
  module
    function useGroupContext(component: string) {
      const context = useContext(GroupContext);
      if (!context) {
        throw new Error(`${component} must be used inside FluidTooltip.Group.`);
      }
      return context;
    }
  ```
- Exactly one component in a file becomes the root: it emits `props { a, b }: T`
  at column 0 followed directly by the converted JSX, with the function name and
  any `export`/`export default` dropped. The `export default` component wins;
  with no default export, the component every other component's name starts
  with does (see *Known limitations*). Inline object
  type literals (`{ x: string; y: number }`) are rendered on one line with
  `;`-separated members, matching the source style, at any nesting depth.
- Every *other* component becomes a named `component Name` block with its own
  `props ...` line nested inside it, matching the shape used throughout
  `node_modules/beast-tsrx/examples`:

  ```btsx
  component Avatar
    props { user }: { user: Post["author"] }
    img.avatar(src={user.avatar} alt={user.name})
  ```
- In either case the statements before the `return` become `setup` lines. A
  statement that prints on one line uses the inline `setup <stmt>;` form; a
  multi-line one (a block-bodied arrow, an `if`) uses the indented block form,
  since an unmarked continuation line would otherwise be parsed as markup.
- `forwardRef((props, ref) => jsx)` is unwrapped rather than called. Octane has
  no `forwardRef` — a ref is an ordinary prop there and nothing needs
  forwarding (`beast-tsrx/examples/refs`) — so leaving the call in place would
  emit a reference to an import that was just dropped. The function inside
  becomes the component, and its second parameter rejoins the first as a `ref`
  prop, placed ahead of any rest element so the binding pattern stays valid and
  `ref` keeps out of the rest, exactly as `forwardRef` had it:

  ```btsx
  component Trigger
    props { label, onFocus, ref, ...props }: TriggerProps & { ref: Ref<HTMLButtonElement> }
    button({...props} ref={ref} onFocus={onFocus}) #{label}
  ```

  `forwardRef<HTMLElement, Props>` states both halves of that type; without the
  type arguments the parameters' own annotations are used, and with neither the
  `props` line is left untyped under a comment saying so. This works for
  `const Name = forwardRef(...)`, for `export default forwardRef(...)` (which
  becomes the file's own component), and for `React.forwardRef`. Once every use
  is unwrapped the import is no longer reported as dropped — losing it is the
  point. A `forwardRef` referenced anywhere else is still reported.
- An `async` component loses `async`: Octane components are synchronous and
  suspend by reading a promise with `use()` under `Suspense`. Every `await x`
  in the component's own body becomes `use(x)`, and `use` is imported from
  `octane`, or taken from an existing import of React's `use`. An `await` in
  a function nested inside the component, such as an `async` handler, is left
  alone. Awaiting anything other than a reference to an existing promise, such
  as `await fetchUser(id)`, is reported as `uncached-use-promise`, because
  that creates a new promise on every render and it never settles.
- `const Name = (...) => ...` and `const Name = function () { ... }` are treated
  the same way, but *only* when the name is capitalized and the initializer
  actually returns JSX; any other arrow-valued `const` stays an ordinary
  `module` declaration. Concise arrow
  bodies (`() => <div/>`) have no statements to hoist, so they emit no `setup`
  lines.

- Early returns become branches. A component body that returns from inside an
  `if` emits its leading declarations as `setup` and the rest as an
  `if` / `elseif` / `else` chain: the code after a guard is its `else`, a guard
  directly followed by another continues as `elseif`, and declarations inside a
  branch go into a `scope` block. A branch that returns `null` is dropped,
  negating the condition when it was the `if` arm.
- A helper in the body that returns JSX — `const renderValue = (value, path) =>
  <span/>` — is lifted into a `component` block (`RenderValue`) when every use of
  it is a call the template renders: a JSX child, a branch of a conditional
  there, or a returned value. The calls become elements with the arguments as
  props named after the parameters, and any names the helper read from the
  component around it are passed along explicitly, as for a lifted render prop.
  A helper used any other way stays in `setup`.
- String literals are requoted on the AST, not on printed text, so an
  apostrophe in a comment or JSX text is left alone.
- `import { ReactNode } from "react"` without `type` is still recognised as a
  type and renamed like one.

**Block keywords**
- A component whose root is an explicit `<>...</>` with more than one child emits
  a `fragment` block. Multiple roots are legal without it
  (`beast-tsrx/examples/fragment`), but keeping the author's fragment makes the
  grouping explicit and gives a `style` block something to sit beside. Fragments
  anywhere else flatten into their siblings, which is valid in every position —
  control-flow branches accept multiple children.
- `<style>{`...`}</style>` becomes a `style` block. The CSS is dedented to its own
  common indentation and re-indented under the block, since indentation is
  structural. Both a template literal and plain text children work.
- `<Suspense fallback={F}>` becomes `try` / `pending`, and `<ErrorBoundary
  fallback={F}>` becomes `try` / `catch`. An `ErrorBoundary` wrapping a single
  `Suspense` collapses into one `try` carrying both branches — the shape
  `beast-tsrx/examples/boundary` uses. A fallback written as
  `(error, reset) => jsx` supplies the `catch` bindings; any other fallback emits
  a bare `catch`, and a non-JSX fallback becomes pipe text.

**JSX → pug-like syntax**
- Self-closing / element tags: a lowercase, dot-free tag name (`div`, `p`,
  `span`, ...) is treated as an HTML tag; anything else (`Foo`, `Theme.Provider`)
  is treated as a component reference.
- `className="single-class"` on an HTML tag becomes shorthand: `tag.single-class`
  (and `div.single-class` collapses further to `.single-class`, since `div` is
  the implicit default tag), but only when the value matches
  `[A-Za-z_][A-Za-z0-9_-]*`. The selector grammar is narrow: Tailwind values like
  `sm:px-2`, `bg-black/40` and `w-[calc(100%-1rem)]` are rejected outright, and a
  dotted value such as `p-2.5` is worse — it parses as *two* classes (`p-2` and
  `5`). Anything outside that charset, multi-class, or dynamic `className` falls
  back to a plain attribute.
- A static `id="foo"` on an HTML tag becomes the `#foo` selector shorthand, so
  `<h1 id="title" className="big">` writes as `h1#title.big` and a `div` with
  either shorthand drops its implicit tag name (`<div id="p" className="wrap">`
  → `#p.wrap`). Ids that are not valid selector fragments, and dynamic
  `id={expr}`, stay ordinary attributes.
- All other attributes render as `(name={expr} name="str" ...)`, omitted
  entirely when there are none. A JSX spread renders in place as `{...expr}` —
  the braces are required; Beast rejects a bare `...expr` with
  `BEAST1202_INVALID_ATTRIBUTE`.
- A render prop — children written as a function the element calls itself,
  `<Root>{({ payload }) => <Popup/>}</Root>` — is lifted into its own
  `component` block, and the element gets a `children={...}` attribute that
  calls it. It cannot stay an attribute expression: Beast's attribute scanner
  reads the `/` in a closing tag as the start of a regular expression, so any
  JSX left inside parentheses swallows the rest of the list and fails with
  `BEAST1201_UNCLOSED_ATTRIBUTES`.

  A `component` block is written at module scope and closes over nothing, so
  every name the function read from the component around it — props, `setup`
  values — becomes a prop, passed explicitly at the call site. Names that
  resolve at module scope (imports, `module` declarations, other components)
  and ambient globals are left alone, and a lowercase JSX tag is an element
  rather than a reference.

  ```btsx
  // lifted from the Tooltip.Root render prop; className came from the component around it
  // its props type is the one thing the conversion cannot infer — annotate it
  component TooltipRootChildren
    props { payload, className }
    Tooltip.Portal
      if payload
        Tooltip.Popup(className={cn("base", className)}) #{payload.label}

  Tooltip.Root(children={(state) => createElement(TooltipRootChildren, { ...state, className })})
  ```

  The attribute *creates* the element rather than calling the component: a
  compiled component takes the runtime's own arguments beside its props, so
  invoking it from the render prop — or handing the bare component to a library
  that calls `children(state)` — leaves those undefined and it dies reading its
  block. `createElement` is imported from Octane for this. When the function
  captured nothing, the state object it destructures is already the props
  object, so the call is just `createElement(Name, state)`. A render prop that
  returns something other than JSX has no template to lift and stays the
  expression it was.
- An element passed as an attribute, like `activeIcon={<CheckIcon />}`, is
  lifted the same way. BTSX attributes hold TypeScript expressions, so markup
  left there would stay JSX. The markup moves into a `component` block named
  after the attribute, and the attribute creates it. Any names it used from the
  component around it are passed in as props. A name that was a prop declared
  in an inline object type keeps its declared type. Any other name, such as a
  `setup` value, is reported as `untyped-props`.

  ```btsx
  component ActiveIcon
    props { iconClassName }: { iconClassName?: string }
    CheckCircledIcon(className={cn("size-4", iconClassName)})

  AnimatedIcon(active={copied} activeIcon={createElement(ActiveIcon, { iconClassName })})
  ```
- When a tag line with two or more attributes would exceed 100 columns, *or* an
  attribute value printed across more than one line, the attribute list is
  broken across `~` continuation lines. Beast rejoins continuations with a
  single space, so a multi-line handler body becomes one logical line — and
  since a `//` comment would swallow everything joined after it, expressions
  are printed without comments:

  ```btsx
  section(
    ~ role="tabpanel"
    ~ className="grid gap-4"
    ~ )
    p Child content
  ```

  A wrapped tag has no line end left to append to, so its children always take
  their own lines even when they would otherwise have been inlined.
- Children:
  - No children → tag line only.
  - A single child that's a plain string → inline: `tag some text`.
  - A single child that's a "simple" expression (not a ternary, not an
    iteration call) → inline: `tag #{expr}`.
  - Text mixed with exactly one simple expression and no element children →
    inline concatenation: `h1 Welcome, #{user.name}`.
  - Otherwise, each child gets its own indented line under the parent:
    - Element/self-closing children recurse normally.
    - An immediately-invoked switch —
      `{(() => { switch (k) { case "a": return <A/>; default: return <D/> } })()}` —
      becomes a `switch` block. Consecutive labels that share a body each get
      their own arm repeating it — `case "b", "c"` compiles to a comma
      expression that only matches `"c"`. An arm is converted like a function
      body: declarations before its `return` go into a `scope`, guards become
      `if` chains, and a trailing `break` is ignored. An arm that renders
      nothing (`return null`) is written `| #{null}` — Beast rejects an empty
      arm (`BEAST1606_EMPTY_SWITCH_ARM`), and leaving it out would send its
      label to `default`. An arm with no template form is reported as
      `unconverted-switch-case`.
    - A bare expression becomes `| #{expr}`. The pipe is not optional: an
      unprefixed `#{expr}` line is read as an id selector
      (`BEAST1101_INVALID_SELECTOR`).
    - A ternary `{cond ? <A/> : <B/>}` becomes an `if <cond>` / `else` block,
      with each branch's JSX indented one level further. A ternary in the false
      branch continues the chain as `elseif` rather than nesting a new `if`, and
      a false branch of `null` / `undefined` / `false` emits no `else` at all.
      The mirror image — `{cond ? undefined : <A/>}`, a one-armed `if` written
      inside out — negates the condition and keeps only the branch that
      renders, instead of emitting an arm that renders nothing.
    - `{cond && <A/>}` becomes a bare `if <cond>` with no `else`.
    - Iteration becomes `each item, i in list`, followed by the returned JSX
      indented one level further. Two call shapes are recognized: the
      `__map_iterable(list, cb)` helper the Beast toolchain emits, and a plain
      `list.map(cb)`. Both `(item) => ...` and `(item, i) => ...` arrow shapes
      are supported, as either an expression body or a `{ return (...) }` block.
      A `key` prop on the produced element is hoisted onto the `each` line
      (`each item in list key item.id`) rather than left as an attribute.
      A third callback parameter — the array itself — has no loop binding, so
      it is declared in a `scope` from the iterable (`setup const all = xs;`).
      An iterable that is anything but a plain name or property path is then
      evaluated again on every iteration, which is reported as
      `reevaluated-iterable`.
    - Beast requires one or two plain identifiers as loop bindings
      (`BEAST1402_INVALID_EACH_BINDING`), so a destructuring callback parameter
      is bound to a generated name and unpacked in a `scope` block instead. The
      key stays an attribute there, since it usually references the unpacked
      names, which are not in scope on the `each` line:

      ```btsx
      each item in xs
        scope
          setup const { id, name } = item;
          li(key={id}) #{name}
      ```
    - A callback with statements before its `return` gets the same `scope`
      block. Its key is still hoisted when it reads only the loop bindings.
    - Among text, a ternary between values — `{n} item{n !== 1 ? 's' : ''}` —
      stays interpolated. Splitting it into branches would put the text around
      it on separate lines, and the spaces between them are lost.

## Known limitations

This DSL was reverse-engineered from a single example, so a few areas are
implemented with a reasonable-but-unverified fallback rather than a confirmed
rule:
- A guard clause is only understood when its `then` branch always returns and
  it sits directly in the body — declarations, then `if (...) return`, repeated.
  A return inside a loop, `try` or `switch`, or an `if` that can fall through
  into the code after it, has no branch form without duplicating that code, so
  such a body keeps the old behaviour: the last `return` is the template and
  everything before it is `setup`. It is reported as
  `unconverted-early-return`.
- `<Suspense>` and `<ErrorBoundary>` props other than `fallback` (`onReset`,
  `resetKeys`, a spread) have no place on a `try` block and are dropped, with a
  `dropped-boundary-prop` diagnostic for each.
- A lifted helper's props are untyped when it captured anything from the
  component around it, for the same reason as a lifted render prop.
- Only `className`, `id` and `key` get special treatment; other conventionally
  "special" props (e.g. `style`) are emitted as plain attributes. A `className`
  or `id` written *after* a JSX spread stays a plain attribute rather than a
  selector shorthand, because a shorthand always renders before the attribute
  list and hoisting it would flip which value wins.
- Multi-class or non-string `className` values fall back to a plain
  `class={...}` attribute — this format wasn't in the example, so treat it as
  a best guess.
- `.map(cb)` is matched purely on the method name, so a non-array `.map()`
  (e.g. `new Map().map`) in JSX child position would also become an `each`.
- `empty` (the `each` fallback branch) is not emitted: it would mean guessing
  that a condition tests the same list the `each` iterates, and mistranslating
  that is worse than leaving the ternary as an `if`.
- `switch` is recognised only in the immediately-invoked form. A `switch`
  statement in the function body before the `return` stays a `setup` statement.
- A lifted render prop's props are untyped unless the source annotated the
  parameter and the function captured nothing. The types of captured values
  live in the component the function was lifted out of, which the generated
  `component` block cannot name, so the conversion leaves the annotation off
  and says so in a comment above the block. Under `strict` that is an implicit
  `any`, so it is meant to be filled in.
- The file's own component is the default export when there is one, otherwise
  the component every other component's name starts with; a file with neither
  has no main. It is written as the file's template — `props`, `setup` and
  markup at column 0 — which Beast compiles straight to
  `export default function Name() @{ ... }`, and it is dropped from
  `export { ... }` (Beast already exports it).

  Beast names that default export after the file (`react-signal.btsx` exports
  `ReactSignal`), so this only works when nothing else uses the component's own
  name. When something does — a sibling rendering `<DropdownMenu>`, an exports
  object, a component rendering itself — it falls back to a `component NameRoot`
  block, references are renamed, and the template renders it. Only references
  are renamed: `Card.displayName = "Card"` keeps its string, and an exports
  object `{ Card }` becomes `{ Card: CardRoot }` so `Parts.Card` still
  resolves:

  ```
  props props: MenuPrimitive.Root.Props
  DropdownMenuRoot({...props})
  ```
- A render prop is only recognised as the sole child of its element. Children
  mixing a function with other nodes are left alone.

## Files
- `src/lib/tsx-btsx.ts` — the public entry point (`convertTsx`,
  `convertTsxToBtsx`, `BtsxConversionError`), re-exported from
  `src/lib/converter/`.
- `src/lib/converter/` — the implementation, one module per concern:

  | module | responsibility |
  | --- | --- |
  | `convert.ts` | entry point; orders the output sections Beast requires |
  | `imports.ts` | React and npm imports rewritten onto Octane |
  | `declarations.ts` | `module` members and inline type rendering |
  | `components.ts` | component detection, `forwardRef`, the file's own template |
  | `flow.ts` | `setup`, and early returns as `if` / `elseif` / `else` |
  | `lift.ts` | helpers and render props lifted into `component` blocks |
  | `scope.ts` | free-name analysis and collision-free generated names |
  | `jsx.ts` | the template emitter: elements, attributes, children |
  | `blocks.ts` | `each`, `switch`, `try`, `style` |
  | `print.ts` | node printing, with requoting and renames done on the AST |
  | `ast.ts`, `text.ts` | stateless AST questions and line utilities |
  | `diagnostics.ts` | the thrown parse error and the warnings a result carries |
  | `context.ts` | the state one conversion carries |

  The emitter is recursive descent, so `jsx`, `blocks`, `flow` and `lift` call
  one another; every module exports only functions and constants with no
  import-time work, which keeps those cycles safe.
- `tests/converter.test.ts` — behavioural tests (`bun test`).
- `src/samples/index.ts` — the TSX sources that seed the playground.
- `docs/*.expected.btsx` — expected output of
  each sample, kept as reference fixtures. The converter reproduces them exactly
  apart from the blank lines the goldens use to separate top-level blocks.

## Validating against the real toolchain

`bun run validate` converts every sample plus a set of edge cases and pushes
each result through the stages a `.btsx` file goes through on its way into the
app: `parse` from `beast-tsrx`, `compileBeastResult` down to TSRX, and Octane's
own `compile` from `octane/compiler` on that TSRX. It is wired into
`bun run check`.

The parser alone is not enough. Beast accepts output that only Octane rejects:
bare text in an `@if` or `@catch` body is read as JavaScript, a branch may hold
only one JSX root, and a wrapped `{ ...props, }` is a syntax error. Beast even
compiles `case "b", "c"` to a comma expression that only ever matches `"c"`.
Each of those was found by the Octane stage.

`bun run validate:types` also typechecks the samples' TSRX with `tsrx-tsc`
(written to `.beast/validate`). It is not part of `check`: the samples reference
components they never declare. Edge cases are skipped there for the same reason.

When adding a converter feature, add a case to `scripts/edge-cases.ts` alongside
it. The playground's TSRX panel runs the same two compile stages live.

Validation proves output *compiles*; it cannot tell that valid output says the
wrong thing — a label renamed, a type member dropped, a template literal's
whitespace rewritten. `bun test` pins those down with assertions on the output
and on the diagnostics, and is also part of `bun run check`.

`~/Code/beast/packages/language-server` is the other useful reference: its
`BEAST_KEYWORDS` table is the definitive keyword list (note `fragment`, `scope`
and `style`, which this converter does not emit), and its line-merging code
documents the `~` continuation rule exactly — strip the `~`, strip one following
space, join to the previous line with a single space, indentation irrelevant.

## Validating against the real grammar

`node_modules/beast-tsrx/examples/*/*.btsx` ships hand-written Beast sources
covering hooks, context, portals, boundaries, transitions and more. They are the
authoritative reference for anything this converter has to guess at — the
`component X` / nested `props` shape and the `each ... key ...` clause were both
confirmed there rather than inferred.

Note that `examples/card/card.btsx` writes the key as an attribute
(`li.message(key={message.id})`) while `examples/catalog` and `examples/actions`
use the `each ... key` clause. This converter emits the clause form.
