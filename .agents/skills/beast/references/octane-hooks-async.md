# Octane async hooks and actions in BTSX

Read this reference for Promise reads, Suspense-style boundaries, transitions, deferred values, form actions, or optimistic state.

## Choose by job

| Need | API |
| --- | --- |
| Read a Promise or context during render | `use` |
| Mark a non-urgent update outside a component hook | `startTransition` |
| Start a non-urgent update and read pending state | `useTransition` |
| Let a slow subtree temporarily use an older value | `useDeferredValue` |
| Track an action result and pending state | `useActionState` |
| Read the nearest parent form's active action | `useFormStatus` |
| Show the expected result before an action finishes | `useOptimistic` |
| Reset uncontrolled fields after an action settles | `requestFormReset` |

## Promise reads and Beast boundaries

Keep Promises stable by creating them in a data layer, router, setup initializer, or event handler rather than recreating them every render. `use(promise)` suspends to the closest boundary and throws failures to the closest error boundary.

```btsx
module
  interface Props { data: Promise<{ name: string }> }

import { use } from "octane"

component Profile
  props { data }: Props
  setup const profile = use(data)
  h2 #{profile.name}

props { data }: Props
try
  Profile(data={data})
pending
  p Loading profile…
catch error
  p Could not load profile: #{String(error)}
```

Independent `use()` reads may start in parallel under Octane's compiler. Keep truly dependent reads sequential.

## Transitions and deferred values

```btsx
module
  interface Props { onOpenReport: () => void }

import Results from "./Results.btsx"
import { useDeferredValue, useState, useTransition } from "octane"

props { onOpenReport }: Props
setup
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [isPending, startTransition] = useTransition()

main
  input(value={query} onInput={(event) => setQuery(event.currentTarget.value)})
  button(type="button" onClick={() => startTransition(onOpenReport)})
    | #{isPending ? "Opening…" : "Open report"}
  div(aria-busy={query !== deferredQuery})
    Results(query={deferredQuery})
```

Typing and other direct interactions stay urgent. A transition does not make work faster; it lets useful current UI remain visible while non-urgent work proceeds. `useDeferredValue` is not a debounce and does not reduce requests.

## Actions and forms

`useActionState(action, initialState)` returns the current result, an action function suitable for `<form action={...}>`, and pending state. The action receives the previous result before its normal form arguments.

```btsx
module
  async function saveName(previousMessage: string, formData: FormData) {
    const name = String(formData.get("name") ?? "").trim()
    return name ? `Saved ${name}` : previousMessage
  }

import { useActionState } from "octane"

setup
  const [message, submit, isPending] = useActionState(saveName, "")

form(action={submit})
  input(name="name")
  button(type="submit" disabled={isPending}) Save
  p(aria-live="polite") #{message}
```

- Call `useFormStatus` from a child rendered beneath the form whose status it reads, not from the component that creates that form.
- Use `useOptimistic` for temporary expected state and reconcile it with the action's authoritative result.
- `requestFormReset(form)` resets uncontrolled fields after the surrounding action or transition settles.
- Keep pending, error, and success output accessible with disabled states and appropriate live regions.

## Official references

- [Octane Core APIs](https://octanejs.dev/docs/core-apis)
- [Octane TSRX basics](https://github.com/octanejs/octane/blob/main/docs/tsrx-basics.md)
- [Octane differences from React](https://github.com/octanejs/octane/blob/main/docs/differences-from-react.md)
