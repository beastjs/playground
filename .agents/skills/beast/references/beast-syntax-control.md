# Beast BTSX control flow

Read this reference when authoring conditions, keyed or empty lists, switches, or async/error boundaries.

## Conditions

```btsx
if status === "ready"
  ReadyView
elseif status === "loading"
  LoadingView
else
  ErrorView
```

`if`, `elseif`, and `else` branches must be adjacent, aligned, and non-empty. `if` and `elseif` require conditions; `else` does not.

## Lists

```btsx
each item, index in items key item.id
  Row(item={item} position={index})
empty
  p No matches.
```

`each item[, index] in iterable [key expression]` emits native `@for`. Beast never invents an index key. A `key={...}` on the loop's only root can be hoisted instead of a header key. `empty` must immediately follow its `each` at the same indentation and have a body.

## Switches

```btsx
switch variant
  case "editor"
    Editor
  case "viewer"
    Viewer
  default
    Empty
```

`case` and `default` are non-empty direct children of `switch`. A switch may have at most one `default`.

## Async and error boundaries

```btsx
try
  Profile(data={profileData})
pending
  p Loading profile…
catch error, reset
  button(type="button" onClick={reset}) Try again
```

`try` has no header expression and requires `pending`, `catch`, or both. When both exist, `pending` comes first. Catch bindings may be bare (`catch error, reset`) or parenthesized. Every arm must have a body.

## Continuation in headers

When a long header needs multiple physical lines, use an indented `~` continuation. Read [beast-syntax-advanced.md](beast-syntax-advanced.md) for its complete rules.

```btsx
each item in items
  ~ key item.id
  li #{item.label}
```
