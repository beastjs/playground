# Octane effects and custom hooks in BTSX

Read this reference for effects, external stores, effect events, imperative refs, or dependency inference. Use an effect only to synchronize with a system outside Octane's render flow.

## Choose by job

| Need | API |
| --- | --- |
| Subscribe or synchronize after paint | `useEffect` |
| Measure or adjust layout before paint | `useLayoutEffect` |
| Insert styles before layout effects | `useInsertionEffect` |
| Read latest committed logic inside an effect without reconnecting | `useEffectEvent` |
| Subscribe to an external authoritative store | `useSyncExternalStore` |
| Customize a value exposed through a ref | `useImperativeHandle` |

Calculate derived values during render and handle user actions in event handlers. Do not add an effect for ordinary data flow, prop-to-state correction, or page metadata that can be rendered directly.

## Effect shape

```btsx
module
  interface Props { roomId: string; onMessage: (message: string) => void }

import { connect } from "./connection"
import { useEffect, useEffectEvent } from "octane"

props { roomId, onMessage }: Props
setup
  const notify = useEffectEvent((message: string) => onMessage(message))

  useEffect(() => {
    const connection = connect(roomId)
    connection.onMessage(notify)
    return () => connection.close()
  })

p Connected to #{roomId}
```

The compiler infers `roomId` as reactive. The Effect Event is non-reactive and omitted from dependencies while its committed wrapper calls the latest body. Do not add Effect Events to dependency arrays.

## Dependency arguments

For `useEffect`, `useLayoutEffect`, `useInsertionEffect`, `useMemo`, `useCallback`, and `useImperativeHandle`:

- Omit the dependency argument to let the compiler infer reactive captures.
- Pass an explicit array to make that list authoritative; `[]` means mount/unmount only.
- Pass `null` deliberately to run after every render.
- Pass an explicit array or `null` for an opaque callback such as `useEffect(makeEffect())`; the compiler cannot safely evaluate it again to discover captures.
- State setters, reducer dispatchers, refs, state getters, imports, and unreassigned module bindings are treated as stable.

Direct built-in hook calls receive dependency inference in compiled `.btsx`/`.tsrx`/`.tsx` and plain `.ts`/`.js`. Calls to a custom wrapper receive inference only when the wrapper is local to the same fully compiled TSRX/TSX module and transparently forwards its callback plus final dependency parameter. Imported, method-style, plain TypeScript callers, and transforming wrappers need an explicit dependency argument.

## External stores

Use `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)` when a browser API, state library, or cache already owns the truth.

- `subscribe` receives a notification callback and returns cleanup.
- Keep `subscribe` and snapshot functions stable when possible.
- Preserve an object snapshot's identity until its contents change.
- Supply a deterministic server snapshot for SSR and hydration when the store is browser-backed.

## Effect timing and refs

- `useEffect` runs after commit and owns cleanup for subscriptions, timers, and external integrations.
- `useLayoutEffect` is for measurement or mutation that must finish before paint; do not use it as the default effect.
- `useInsertionEffect` is primarily for styling libraries.
- `useImperativeHandle` customizes what a component exposes through its ordinary `ref` prop.
- Effects are inactive during server rendering. Ensure their initial markup is meaningful before hydration.

## Official references

- [Octane Core APIs: refs and effects](https://octanejs.dev/docs/core-apis#refs-and-effects)
- [Octane differences from React: inferred dependencies](https://github.com/octanejs/octane/blob/main/docs/differences-from-react.md#compiler-inferred-hook-dependencies)
- [Octane build tools](https://octanejs.dev/docs/build-tools)
