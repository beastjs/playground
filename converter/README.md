# tsxToBtsx

`convertTsxToBtsx(source: string): string` — converts a `.tsx` source string into
the `.btsx` template syntax, using the real TypeScript AST (via the `typescript`
compiler API) rather than regex, so it handles nesting, quoting, and expressions
correctly instead of guessing at string patterns.

```ts
import { convertTsxToBtsx, BtsxConversionError } from "../src/lib/tsx-btsx";

try {
  const btsx = convertTsxToBtsx(tsxSource);
} catch (error) {
  if (error instanceof BtsxConversionError) console.error(error.diagnostics);
}
```

The TypeScript parser is error-tolerant and will happily return a tree full of
garbage for garbage input. `convertTsxToBtsx` checks the parse diagnostics up
front and throws `BtsxConversionError` (carrying `line:col message` strings in
`.diagnostics`) rather than emitting a nonsensical conversion.

Requires the `typescript` package as a dependency (`npm install typescript`).
Written in strict TypeScript — no `any`.

## Rules implemented (reverse-engineered from the example)

**Top level**
- A `// comment` line directly preceding a statement is treated as a section
  marker and reproduced as-is, flushing any pending `module` block first.
- `import { a, type B, c } from 'react'` → type-only specifiers are dropped,
  `'react'` is rewritten to `"octane"`, quotes are doubled, a semicolon is added.
  Default (`import React from 'x'`), namespace (`import * as ns from 'x'`),
  combined (`import R, { a } from 'x'`) and bare side-effect (`import './a.css'`)
  imports are all preserved. A whole-statement `import type { ... }` is dropped,
  as is an import whose every specifier was type-only.
- Consecutive top-level `type` / `interface` / `const`/`let`/`var` declarations
  are collected and wrapped in a single `module` block (2-space indented),
  flushed right before the next function declaration (or at end of file).
  Inside interfaces, a `ReactNode` (or `React.ReactNode`) property type becomes
  `unknown`.
- Exactly one component in a file becomes the root: it emits `props { a, b }: T`
  at column 0 followed directly by the converted JSX, with the function name and
  any `export`/`export default` dropped. The `export default` component wins;
  with no default export, the last component that takes props does. Inline object
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
- `const Name = (...) => ...` and `const Name = function () { ... }` are treated
  the same way, but *only* when the initializer actually returns JSX; any other
  arrow-valued `const` stays an ordinary `module` declaration. Concise arrow
  bodies (`() => <div/>`) have no statements to hoist, so they emit no `setup`
  lines.

**JSX → pug-like syntax**
- Self-closing / element tags: a lowercase, dot-free tag name (`div`, `p`,
  `span`, ...) is treated as an HTML tag; anything else (`Foo`, `Theme.Provider`)
  is treated as a component reference.
- `className="single-class"` on an HTML tag becomes shorthand: `tag.single-class`
  (and `div.single-class` collapses further to `.single-class`, since `div` is
  the implicit default tag). Multi-class or dynamic `className` falls back to
  a regular `class={...}`/`class="..."` attribute.
- A static `id="foo"` on an HTML tag becomes the `#foo` selector shorthand, so
  `<h1 id="title" className="big">` writes as `h1#title.big` and a `div` with
  either shorthand drops its implicit tag name (`<div id="p" className="wrap">`
  → `#p.wrap`). Ids that are not valid selector fragments, and dynamic
  `id={expr}`, stay ordinary attributes.
- All other attributes render as `(name={expr} name="str" ...)`, omitted
  entirely when there are none. A JSX spread renders in place as `...expr`.
- When a tag line with two or more attributes would exceed 100 columns, the
  attribute list is broken across `~` continuation lines:

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
    - A bare expression sibling becomes `| #{expr}`.
    - A ternary `{cond ? <A/> : <B/>}` becomes an `if <cond>` / `else` block,
      with each branch's JSX indented one level further. A ternary in the false
      branch continues the chain as `elseif` rather than nesting a new `if`, and
      a false branch of `null` / `undefined` / `false` emits no `else` at all.
    - `{cond && <A/>}` becomes a bare `if <cond>` with no `else`.
    - Iteration becomes `each item, i in list`, followed by the returned JSX
      indented one level further. Two call shapes are recognized: the
      `__map_iterable(list, cb)` helper the Beast toolchain emits, and a plain
      `list.map(cb)`. Both `(item) => ...` and `(item, i) => ...` arrow shapes
      are supported, as either an expression body or a `{ return (...) }` block.
      A `key` prop on the produced element is hoisted onto the `each` line
      (`each item in list key item.id`) rather than left as an attribute.

## Known limitations

This DSL was reverse-engineered from a single example, so a few areas are
implemented with a reasonable-but-unverified fallback rather than a confirmed
rule:
- An early `return <jsx/>` guard clause is not understood. `splitBody` treats the
  last `return` as the template and everything before it as `setup`, so a guard
  clause is emitted as a `setup` block containing raw TSX — syntactically valid
  but semantically wrong. Restructure guards as a ternary before converting.
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
- The `empty`, `switch`/`case`/`default` and `try`/`pending`/`catch` keywords in
  the BTSX grammar have no converter support. `empty` would mean guessing that a
  condition tests the same list the `each` iterates, and mistranslating that is
  worse than leaving the ternary as an `if`; the others have no unambiguous JSX
  source form.
- Consecutive `setup` statements are emitted one per line rather than grouped
  into a single indented `setup` block. Both forms are valid.

## Files
- `src/lib/tsx-btsx.ts` — the converter (`convertTsxToBtsx`).
- `src/samples/index.ts` — the TSX sources that seed the playground.
- `docs/*.expected.btsx` — expected output of
  each sample, kept as reference fixtures. The converter reproduces them exactly
  apart from the blank lines the goldens use to separate top-level blocks.

## Validating against the real grammar

`node_modules/beast-tsrx/examples/*/*.btsx` ships hand-written Beast sources
covering hooks, context, portals, boundaries, transitions and more. They are the
authoritative reference for anything this converter has to guess at — the
`component X` / nested `props` shape and the `each ... key ...` clause were both
confirmed there rather than inferred.

Note that `examples/card/card.btsx` writes the key as an attribute
(`li.message(key={message.id})`) while `examples/catalog` and `examples/actions`
use the `each ... key` clause. This converter emits the clause form.

