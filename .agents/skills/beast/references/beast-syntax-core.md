# Beast BTSX core syntax

Read this reference for ordinary `.btsx` authoring and review. Beast turns indentation into native TSRX; Octane remains the runtime and final TypeScript/TSRX validator.

## File shape

Declarations must precede the first template node. `module` and `setup` accept one inline statement or an indented raw TypeScript block. Imports and `props` occupy one logical line; trailing semicolons are optional.

```btsx
module
  interface Props { title: string; items: { id: string; label: string }[] }

import { useMemo } from "octane"

component ItemCount
  props { value }: { value: number }
  p Count: #{value}

props { title, items }: Props
setup const count = useMemo(() => items.length)

main.page
  h1 #{title}
  ItemCount(value={count})
```

`module` and `setup` source is preserved as TypeScript with common indentation removed. A `props` declaration contains the complete function parameter, including its type. Explicit compiler or bundler `propsParam` options override source-level props.

## Elements and attributes

| BTSX | Meaning |
| --- | --- |
| `section` | native element |
| `.card` | `div` with class `card` |
| `section#intro.hero` | element with ID and class shorthand |
| `Card` | component reference |
| `Theme.Provider` | dotted component API |
| `Card.featured` | component plus class shorthand |

Capitalized selectors are component references. After one, PascalCase and `_`/`$` dotted segments remain part of the component API; a lowercase dotted segment is class shorthand.

Indentation uses spaces. Two spaces is conventional; the parser requires only aligned siblings and children deeper than their parent. Tabs in indentation fail with `BEAST1003_TAB_INDENT`.

Attributes live in parentheses and may be separated by spaces or commas:

```btsx
Button(tone="primary" count={items.length} disabled) Continue
a.link(href={url} target="_blank" rel="noreferrer") Open
article.card({...cardProps} data-id={id}) #{title}
```

- `name="value"` is a string, `name={expression}` is TypeScript, and a bare name is boolean.
- `{...props}` is an ordered TypeScript spread.
- `class` normalizes to `className`.
- Selector classes combine with one explicit `class` or `className`.
- Do not combine ID shorthand with explicit `id`, or repeat an explicit class attribute.

## Text, interpolation, and comments

Inline text follows a selector. Prefix a child with `|` when it must be text rather than an element selector.

```btsx
p Hello, #{user.name}.
div.notice
  | This line is text.
| Symbols stay safe: &lt; &gt; { } &amp;.
```

`#{...}` embeds TypeScript. Literal text and quoted attributes decode HTML entities; expressions remain untouched.

Use `//` for comments. Do not use Markdown-style `#` comments; `#` belongs to ID shorthand and interpolation.

## Common failures

- Move declarations before template content to avoid `BEAST1503_MISPLACED_DECLARATION`.
- Use `{...value}`, not `{value}`, for spreads.
- `component Name` requires one PascalCase TypeScript identifier and a rendered body.
- Close attribute lists and interpolations explicitly; indentation cannot repair an unclosed delimiter.
- Fix authored BTSX when Beast or Octane reports an error. Generated TSRX is inspection evidence only.
