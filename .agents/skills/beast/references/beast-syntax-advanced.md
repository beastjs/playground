# Beast BTSX advanced syntax

Read this reference for fragments, scoped styles, continuation lines, generated TSRX, or source-map behavior.

## Fragments, roots, and styles

```btsx
fragment
  Header
  main Content

style
  .card {
    padding: 1rem;
  }

  :global(body) {
    margin: 0;
  }
```

An authored `fragment` emits a native TSRX fragment. Beast also inserts one for multiple roots, no roots, a text-only root, or a style-only root. A `style` body is raw CSS with common indentation removed; Octane scopes it while `:global(...)` escapes scoping. Explicit fragments and style blocks must not be empty.

## Scoped child setup

Use `scope` when setup belongs to one exact child position instead of the whole
component. Leading `setup` declarations emit inside a nested Octane `@{ ... }`
scope, may capture parent values, and may use hooks. A scope may render one or
more children, or be setup-only.

```btsx
section
  scope
    setup const [count, setCount] = useState(0)
    button(onClick={() => setCount(count + 1)}) Count: #{count}
  scope
    setup observe()
```

Keep every `setup` declaration before the scope's rendered children. Do not add
a wrapper element solely to represent the scope; Beast emits native Octane
child ownership.

## Continuation lines

Prefix a more deeply indented physical line with `~` to append its payload to the preceding authored line. Beast trims the payload and joins it with one space.

```btsx
setup const total = value
  ~ + fallback

Button(
  ~ tone="primary"
  ~ disabled
  ~ onClick={() => save()}
  ~ ) Save

| Long literal text that
  ~ continues on the next physical line
```

Rules:

- `~` must be the first non-space character and deeper than the line it extends.
- `~` with no payload, or `~ // comment`, is a no-op continuation.
- Multiple continuations chain onto the same predecessor.
- An initial or misindented continuation fails with `BEAST1004_ORPHAN_CONTINUATION`.
- Template headers, pipe text, imports, props, inline declarations, and raw `module`, `setup`, and `style` blocks may use continuations.
- Continued fragments retain their physical source locations for diagnostics and source maps.

## Generated TSRX

```btsx
props { title, items }: Props
main.app
  h1 #{title}
  each item in items key item.id
    a.button(href={item.url}) #{item.label}
```

```tsrx
export default function App({ title, items }: Props) @{
  <main className="app">
    <h1>{title}</h1>
    @for (const item of items; key item.id) {
      <a className="button" href={item.url}>{item.label}</a>
    }
  </main>
}
```

`compileBeastResult()` returns readable TSRX, the public AST, diagnostics, and a version 3 BTSX→TSRX map. Vite and Rspack compose Beast mappings through Octane, so downstream locations can trace to BTSX declarations, nodes, branches, attributes, and continuation payloads. Inspect emitted output when useful, but patch BTSX.
