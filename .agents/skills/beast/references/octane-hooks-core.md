# Octane core hooks in BTSX

Read this reference for state, reducers, linked state, context, refs, memoization, IDs, or hook placement in Beast components. Use the Octane version installed by the project as the API authority.

## Choose by job

| Need | API |
| --- | --- |
| Component-owned value | `useState` |
| Several related update rules | `useReducer` |
| Editable state that resets or reconciles when its source changes | `useLinkedState` |
| Subtree data | `createContext` with `use` or `useContext` |
| Mutable value or DOM node without rendering | `useRef` |
| Expensive derived value | `useMemo` |
| Stable callback identity required by a consumer | `useCallback` |
| Server/client-stable accessible ID | `useId` |
| Compatibility debug label; currently no visible runtime effect | `useDebugValue` |

Start with plain calculations and `useState`. Add memoization only when work is expensive or identity matters to a consumer.

## Beast shape

Hooks are ordinary Octane calls inside `setup`; import them before template content.

```btsx
module
  interface Props {
    user: { id: string; name: string }
    onSave: (name: string) => Promise<void>
  }

import { useId, useLinkedState, useMemo, useRef } from "octane"

props { user, onSave }: Props
setup
  const fieldId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [name, setName, getName] = useLinkedState(user.id, () => user.name)
  const normalizedName = useMemo(() => name.trim())
  const saveLater = () => {
    setTimeout(() => void onSave(getName()), 500)
  }

section
  label(id={fieldId}) Name
  input(
    ~ id={fieldId}
    ~ aria-labelledby={fieldId}
    ~ ref={inputRef}
    ~ value={name}
    ~ onInput={(event) => setName(event.currentTarget.value)}
    ~ )
  p Normalized: #{normalizedName}
  button(type="button" onClick={() => inputRef.current?.focus()}) Focus
  button(type="button" onClick={saveLater}) Save
```

## Octane-specific semantics

- `useState`, `useReducer`, and `useLinkedState` may expose a third tuple member: a stable getter for the latest scheduled value. Use it in delayed or async callbacks that must not read a stale render capture. The getter does not subscribe or render and may be newer than the committed DOM during pending work.
- `useLinkedState(source, calculate, options?)` keeps local edits while `source` is unchanged, then calculates the next value immediately when it changes. The calculator receives the new source and the previous `{ source, value }`, or `undefined` initially. `sourceEqual` and `valueEqual` default to `Object.is`.
- Context is not automatically global state. Prefer props or nearby state until multiple distant branches need the same value.
- Refs are ordinary props; a component can accept `ref` directly without `forwardRef`. Host elements may receive multiple refs as an array.
- State is a render snapshot. Use updater form when the next value depends on the previous value, and replace objects or arrays instead of mutating them.

## Hook placement

Octane assigns hooks compiler-stable call-site slots, so a hook may appear after an early return or inside a condition. Do not rewrite correct Octane code merely to satisfy React's call-order rule.

A slot-keyed hook in a plain JavaScript loop is a compile error because every iteration would share one call site. `use()` and `useContext()` are exempt. For per-item state in BTSX, extract a local component and render it from a keyed `each` block.

Strong mode rejects calling a `useState`, `useReducer`, or `useLinkedState` updater during render or directly while setting up an effect, and rejects assigning `ref.current` during render. Event handlers and effects remain valid. Use `useLinkedState` for prop-driven editable state instead of a render-time setter.

## Native input events

Octane uses native browser events. Use `onInput` for every text edit. Native `onChange` means commit, commonly on blur. When commit-on-blur is intentional on a text host, keep `onChange` and add `suppressNativeChangeWarning`; do not add that hint to component callbacks, selects, checkboxes, or radios.

## Official references

- [Octane Core APIs](https://octanejs.dev/docs/core-apis)
- [Octane TSRX basics](https://github.com/octanejs/octane/blob/main/docs/tsrx-basics.md)
- [Octane differences from React](https://github.com/octanejs/octane/blob/main/docs/differences-from-react.md)
