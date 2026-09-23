# Changelog

All notable changes to `beast-converter` will be recorded here.

## [Unreleased]

### Added
- Converter: `convertTsx(source)` returns `{ code, diagnostics }`, reporting
  everything a conversion compiled but could not carry over faithfully — a
  dropped boundary prop, an early return left in `setup`, an untyped lifted
  component, a `React.Name` with no Octane counterpart — each with a code and
  its line and column in the TSX. `convertTsxToBtsx` is unchanged. The
  playground shows them as a warning badge on the BTSX panel.
- `bun test` behavioural tests (`tests/converter.test.ts`) asserting on output
  and diagnostics, run as part of `bun run check`. Validation proves output
  compiles; these catch output that compiles and says the wrong thing.

### Changed
- Align the converter toolchain with Beast 0.2.62, Octane 0.2.13, and the
  Octane Rspack plugin 0.1.50. Signal imports enable native reads automatically;
  conversion validation no longer passes the removed `nativeReads` option.
- Converter: split the 2,700-line `src/lib/tsx-btsx.ts` into
  `src/lib/converter/`, one module per concern. The old path re-exports the
  public API. Output was verified byte-identical across every sample, edge case
  and component source before any behaviour changed.
- Converter: ~15% faster. A node with nothing to rewrite is printed directly
  instead of through a `ts.transform`, printers are shared across conversions,
  and guard analysis caches its per-statement answers instead of re-walking the
  same `if` chains once per nesting level.
- Playground: the conversion, the Beast and Octane compiles and the metrics are
  memoized on the source. Every unrelated re-render — copy feedback, a carousel
  slide, each of the three highlighter results landing — used to rerun the
  whole pipeline, several times per keystroke; the compile stages alone take
  6–25 ms on the samples.

### Fixed
- Preserve non-React type imports, including native Octane signal types.
- Convert text-field `onChange` to native `onInput` for per-edit updates.
  Preserve explicit commit-on-change hints and non-text controls; report
  ambiguous spreads, dynamic input types, and existing `onInput` handlers.
- Converter: renaming the file's component to `NameRoot` rewrote every match
  of the name in the output text, including strings (`displayName = "Card"`),
  JSX text (`p Card details`), and shorthand keys — `{ Card }` became
  `{ CardRoot }`, breaking `Parts.Card`. Renames now apply to references on the
  AST only, and a shorthand property keeps its key (`{ Card: CardRoot }`).
  React type renames (`ReactNode` -> `OctaneNode`) and `React.member`
  resolution moved onto the AST the same way, so a string or comment spelling
  one is left alone.
- Converter: a helper lifted out of one component stayed registered for the
  rest of the file, so a later component calling a prop of the same name
  (`renderRow(xs)`) was emitted as the first component's lifted element.
- Converter: an inline object type dropped every member that was not a
  property — methods, index and call signatures — and `readonly`.
- Converter: re-indenting printed statements also rewrote whitespace inside
  multi-line template literals, changing the string's value.
- Converter: only the last line of a multi-line `//` comment above a statement
  was kept.
- Converter: a `switch` arm whose return was wrapped in a block or preceded by
  declarations was emitted empty, silently losing the arm; arms are now
  converted like a function body. An arm that renders nothing is written
  `| #{null}` instead of being left empty, which Beast rejected
  (`BEAST1606_EMPTY_SWITCH_ARM`).
- Converter: `.map((item, index, array) => ...)` emitted three loop bindings,
  which Beast rejects (`BEAST1402_INVALID_EACH_BINDING`); the array parameter is
  now declared from the iterable. Two destructured parameters no longer share
  one generated name.
- Converter: a component's overload signature was picked as the component
  itself, emitting an empty template and demoting the implementation.
- Converter: a lifted render prop now creates its element with
  `createElement(Name, props)` instead of calling the generated component. A
  compiled component takes the runtime's own arguments beside its props, so
  calling it directly — or passing the bare component to a library that invokes
  `children(state)` — crashed at runtime reading `__s.block`.
- Converter: `forwardRef((props, ref) => jsx)` is unwrapped into a plain
  component whose props include `ref`, instead of being emitted as a call to an
  import that had just been dropped for having no Octane equivalent. Octane
  needs no wrapper — a ref is an ordinary prop. Handles
  `const Name = forwardRef(...)`, `export default forwardRef(...)` and
  `React.forwardRef`, takes the props type from `forwardRef<Element, Props>`
  when it is written, and stops reporting the import as dropped once every use
  is unwrapped.
- Converter: `{cond ? undefined : <A/>}` emits a negated one-armed `if` rather
  than an `if` whose first branch renders nothing.
- Converter: import clauses are read through `phaseModifier` instead of the
  deprecated `ImportClause.isTypeOnly`. That also fixes `import defer * as ns`,
  whose `defer` was silently dropped: the phase decides when the module
  evaluates. The per-specifier `ImportSpecifier.isTypeOnly` is not deprecated
  and is unchanged.
- Converter: declarations are no longer emitted after the template. Everything
  a TSX file writes at the bottom — most often the `const` collecting the
  exports — was emitted as a trailing `module` block, which Beast rejects with
  `BEAST1503_MISPLACED_DECLARATION`. Output now has one fixed order: directive,
  imports, a single `module` block, `component` blocks, then the file's own
  template. A module reference to the file's own component (whose name Beast
  replaces with the file's) is called out in a comment where it is written.
- Converter: a directive such as `"use client"` is emitted as
  `module "use client";` before the imports rather than after them.
- Converter: render props (`<Root>{({ payload }) => <Popup/>}</Root>`) are now
  converted instead of being emitted as pipe text that Beast rejected. The
  function is lifted into its own `component` block — so its markup converts
  like any other — and the element gets a `children={...}` attribute that calls
  it, passing everything the function had closed over as props. JSX cannot stay
  in an attribute: Beast reads the `/` of a closing tag as a regular
  expression and fails with `BEAST1201_UNCLOSED_ATTRIBUTES`.
- Converter: an attribute whose value printed across several lines — an event
  handler with a block body — now becomes `~` continuation lines. It used to be
  written as raw lines that Beast parsed as markup, leaving the attribute list
  unclosed. Expressions are printed without comments, since continuations are
  rejoined into one line where a `//` would swallow the rest.
- Converter: a function whose name starts with a lowercase letter is no longer
  turned into a `component` block. A hook or a helper such as
  `useGroupContext` can never be a component (JSX reads a lowercase tag as an
  HTML element), so it is now declared as written inside `module`. Printed
  multi-line declarations and `setup` bodies are also re-indented from the
  TypeScript printer's four spaces to the two-space BTSX indent, and a
  statement that already closes with `}` no longer gets a stray `;`.
- The `card` sample was a template literal with stray `~` continuation markers
  embedded in it, so the demo's headline output was unparseable garbage rather
  than converted BTSX.
- `bun run typecheck` failed on `src/components/provider.tsx`, which referenced
  the undefined `AdminPanel` and `__map_iterable`. The reference sources are now
  strings in `src/samples/index.ts` (they exist to be converted, not compiled)
  and the expected output lives in `docs/provider.expected.btsx`.
- `convertTsxToBtsx` now throws `BtsxConversionError` with parse diagnostics
  instead of silently emitting nonsense for invalid input.
- `typescript` moved from `devDependencies` to `dependencies`; it is imported by
  the converter and ships in the browser bundle.

### Added
- Converter: plain `list.map(cb)` is recognized as iteration alongside the
  `__map_iterable(list, cb)` helper.
- Converter: JSX spread attributes render as `...expr` instead of being dropped.
- Converter: default, namespace, combined and bare side-effect imports are
  preserved instead of being silently dropped.
- Converter: `const Name = (...) => <jsx/>` and function-expression components
  are converted, gated on the initializer actually returning JSX.
- The demo is now an interactive playground: editable TSX input, live BTSX
  output, sample switching, copy buttons, and inline parse errors.

### Added — BTSX features found in `src/App.btsx`
- `#id` selector shorthand for static ids on HTML tags (`h1#title.big`), with
  the implicit `div` dropped as it already is for classes.
- `~` continuation lines for attribute lists past 100 columns, matching how long
  tags are written by hand.
- `key` is hoisted from the iterated element onto the `each` line
  (`each message, i in messages key message.id`).
- `elseif` chains for nested ternaries, and no `else` branch at all when the
  false branch is `null` / `undefined` / `false`.
- `{cond && <A/>}` converts to a bare `if`; it previously fell through to a
  meaningless `| #{cond && <A/>}` line.

### Added — syntax highlighting
- The TSX pane is a highlighted overlay editor (Shiki layer under a transparent
  textarea, with synced scrolling) and the BTSX pane is highlighted read-only,
  using `github-light` / `github-dark` to match each panel.
- `src/lib/shiki.ts` exports a `highlight(code, lang, theme)` helper.

### Fixed
- `src/lib/shiki.ts` registered the BTSX and TSRX grammars nested under a
  `grammar` key. Shiki expects a `LanguageRegistration` with the TextMate
  fields at the top level, so both languages loaded successfully and highlighted
  nothing. Registration now spreads the grammar.
- `src/style.css` had `@import 'tailwindcss'` after an `@font-face` rule, which
  fails the CSS parse (`@import` must precede all other rules); the `@font-face`
  also used `font-mono: swap` instead of `font-display: swap`.

### Added — advanced samples
- `dashboard`, `palette` and `feed` samples in `src/samples/index.ts`, with
  goldens in `docs/`. Between them they exercise long attribute lists, `#id`
  shorthand, nested and chained iteration (`.filter().map()`, `map` inside
  `map`), `elseif` chains, `&&` guards, spreads, boolean attributes, refs,
  `useMemo`/`useCallback`, context, and several components in one file.

### Fixed — bugs the new samples exposed
- Only one component per file now becomes the bare root `props` block (the
  `export default` one, else the last one taking props). Every other named
  component previously collapsed into a *second* nameless `props` block, losing
  its name and leaving references like `Avatar(user={...})` pointing at nothing.
  They now emit `component Name` with a nested `props` line, matching
  `node_modules/beast-tsrx/examples`.
- Multi-line `setup` statements (block-bodied arrows, `if` statements) emitted
  unmarked continuation lines, which BTSX would parse as markup. They now use
  the indented `setup` block form.
- A `className`/`id` written after a JSX spread was hoisted into the selector
  shorthand, silently reversing which value wins. It now stays a plain attribute
  in source order.
- Nested object types in an interface were printed multi-line by the TS printer,
  breaking the surrounding indentation (indentation is structural in BTSX). They
  now render inline at any depth, and `ReactNode` maps to `unknown` at any depth
  rather than only at the top level.

### Known limitation
- An early `return <jsx/>` guard clause is emitted as a `setup` block containing
  raw TSX — valid syntax, wrong semantics. Restructure as a ternary first.

### Added — responsive panel layout
- Desktop (`min-width: 1024px`) uses `@octanejs/resizable-panels`: a `Group` with
  a draggable `Separator` between the TSX and BTSX `Panel`s, defaulting to a
  50/50 split with a 22% minimum per side.
- Below that breakpoint the panels become a swipeable carousel with paging dots.
  Horizontal paging is native CSS scroll-snap rather than a JS drag handler,
  which is what keeps vertical scrolling inside a panel working: the browser
  picks the gesture axis itself, so a mostly-vertical drag scrolls the code pane
  and a mostly-horizontal one pages between panels. A JS handler would have to
  re-implement that disambiguation and would fight the inner scroller.
- The two panels are now `component SourcePanel` / `component OutputPanel` so
  both layouts share one definition instead of duplicating the markup.
- The layout is chosen by a `matchMedia` listener, not CSS alone, because the
  `Group` sets `touch-action: pan-y` inline — which would block horizontal
  swiping if it were merely hidden on mobile rather than not rendered.

### Added — mouse drag paging
- The mobile carousel can now be dragged with a mouse. Touch and trackpads
  already paged natively; a mouse cannot drag a horizontal scroller, so pointer
  events stand in for the missing gesture.
- Gated on `pointerType === 'mouse'` so touch keeps the browser's own axis
  detection — hijacking touch here would reintroduce the vertical-scroll
  conflict the CSS approach was chosen to avoid.
- A drag only begins after 6px of clearly horizontal movement, and never starts
  on a `textarea`, `button`, `input`, `select` or `a`, so clicking, typing and
  selecting text inside a panel still work.
- Releasing past 20% of the panel width turns the page; anything shorter settles
  back. Snap is disabled during the drag and restored on release.
- `cursor: grab` / `grabbing` only under `@media (pointer: fine)`, so coarse
  pointers are unaffected.
- `setPointerCapture` / `releasePointerCapture` are wrapped in try/catch: they
  throw `NotFoundError` when the pointer is no longer active, which crashed the
  drag handler; capture is an enhancement, not a requirement.

### Added — parser-backed validation
- `bun run validate` (now part of `bun run check`) converts every sample and 19
  edge cases and feeds each result to `parse` from `beast-tsrx` — the same parser
  the compiler and language server use. Edge cases live in
  `scripts/edge-cases.ts`; each one exists because it once produced output Beast
  rejected.

### Fixed — invalid output found by the real parser
Every one of these produced BTSX that looked reasonable but the Beast parser
rejected, so the converter had been emitting uncompilable output:
- JSX spreads were emitted bare (`div(...props)`), which fails with
  `BEAST1202_INVALID_ATTRIBUTE`. They are now braced: `div({...props})`, the form
  used in `beast-tsrx/examples/styling`.
- A bare expression at element position emitted an unprefixed `#{expr}` line,
  which parses as an id selector (`BEAST1101_INVALID_SELECTOR`). It is now
  `| #{expr}`.
- `className` shorthand was used for any value without a space, but the selector
  charset is narrow: `sm:px-2`, `bg-black/40` and `w-[calc(100%-1rem)]` are all
  rejected, and `p-2.5` silently parsed as two classes (`p-2` and `5`). The
  shorthand is now restricted to `[A-Za-z_][A-Za-z0-9_-]*`.
- A destructuring callback parameter emitted `each { id, name } in xs`, but
  Beast requires one or two plain identifiers
  (`BEAST1402_INVALID_EACH_BINDING`). It is now bound to a generated name and
  unpacked in a `scope` block, with the key left as an attribute.
- Multi-line declarations inside a `module` block only had their first line
  indented, leaving the closing `};` at column 0 where it parses as a selector.
  All lines are now indented, and object type aliases render inline.

### Added — the four remaining block keywords
- `fragment`: a component whose root is an explicit `<>...</>` with more than one
  child now emits a `fragment` block instead of bare multiple roots.
- `style`: `<style>{`...`}</style>` becomes a `style` block, with the CSS
  dedented to its own common indentation and re-indented under the block.
- `switch`: the immediately-invoked switch React uses to pick between elements
  becomes a `switch` / `case` / `default` block. Consecutive labels sharing a
  body collapse into one `case "b", "c"` arm.
- `try`: `<Suspense fallback>` becomes `try` / `pending` and
  `<ErrorBoundary fallback>` becomes `try` / `catch`; an `ErrorBoundary` wrapping
  a single `Suspense` collapses into one `try` with both branches. A
  `(error, reset) => jsx` fallback supplies the `catch` bindings.
- New `boundary` sample exercising all four alongside `component`, `module` and
  `scope`, plus six edge cases covering them.
