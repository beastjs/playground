# Changelog

All notable changes to `beast-converter` will be recorded here.

## [Unreleased]

### Fixed
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

