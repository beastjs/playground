/**
 * TSX snippets that each cover a rule the Beast parser enforces. Every one of
 * these was added because it produced output Beast rejected — they are
 * regression coverage, not a wish list.
 */
export const EDGE_CASES: Record<string, string> = {
  // BEAST1202: a spread attribute must stay braced — `(...props)` is rejected.
  'spread attribute': `export default function A({ p }: P) { return <div {...p} className='c'>x</div> }`,
  'spread only': `export default function A({ p }: P) { return <Foo {...p} /> }`,

  // BEAST1101: an unprefixed `#{expr}` line parses as an id selector.
  'expression branch': `export default function A({ a, b }: P) { return <p>{a ? b : b.slice(0, 3)}</p> }`,

  // BEAST1101/1202: the selector charset is narrow, and `.p-2.5` would silently
  // become two classes.
  'tailwind class values': `export default function A({}: P) { return <div className='w-[calc(100%-1rem)]'><p className='sm:px-2'>a</p><i className='p-2.5'>b</i></div> }`,

  // BEAST1402: loop bindings must be one or two plain identifiers.
  'destructured loop binding': `export default function A({ xs }: P) { return <ul>{xs.map(({ id, name }) => <li key={id}>{name}</li>)}</ul> }`,
  'deep destructured binding': `export default function A({ xs }: P) { return <ul>{xs.map(({ a: { b } }, i) => <li key={i}>{b}</li>)}</ul> }`,

  // BEAST1101: a multi-line declaration inside `module` must be indented on
  // every line, or its closing brace lands at column 0.
  'multiline module const': `const cfg = { a: 1, b: { c: 2 } }
export default function A({}: P) { return <p>{cfg.a}</p> }`,
  // A type or interface spanning lines continues onto `~` lines inside `module`.
  'multiline type alias': `type Variant = Base & {
  inset?: boolean
  size: "sm" | "lg"
}
export default function A({ a }: Variant) { return <p>{a}</p> }`,
  'interface continuation': `interface Row<T> extends Base {
  readonly id: string
  nested: { a: T }
  onPick(id: string): void
  [key: string]: unknown
}
interface Empty {}
export default function A({ a }: { a: Row<number> }) { return <p>{a.id}</p> }`,
  'object type alias': `type Late = { a: string; b: { c: number } }
export default function A({ a }: Late) { return <p>{a}</p> }`,
  'module after component': `function H() { return <p>h</p> }
type Late = { a: string }
export default function A({ a }: Late) { return <div><H /></div> }`,
  // A lowercase name can never be a component, so a hook or a helper stays a
  // function declaration inside \`module\`.
  'lowercase helper function': `function useGroupContext(component: string) {
  const context = useContext(GroupContext)
  if (!context) {
    throw new Error(\`\${component} must be used inside FluidTooltip.Group.\`)
  }
  return context
}
const label = (a: string) => a.trim()
export default function A({ a }: P) { return <p>{label(a)}</p> }`,

  // BEAST1503: nothing may be declared after template content, and TSX puts an
  // exports barrel at the bottom of the file.
  'exports declared at the bottom': `import { useState } from "react"
const SIZES = ["sm", "lg"]
function Trigger({ label }: TriggerProps) { return <button>{label}</button> }
export default function Content({ text }: ContentProps) {
  const [open] = useState(false)
  return <p>{text}</p>
}
export const Widget = { Trigger, Content }
export default Widget`,
  'directive before imports': `"use client"
import { useState } from "react"
type Tone = "a" | "b"
export default function Panel({ tone }: { tone: Tone }) { return <p>{tone}</p> }`,

  // Octane has no forwardRef because a ref is an ordinary prop there, so the
  // wrapper is unwrapped rather than called.
  'forward ref component': `import { forwardRef } from "react"
import type { Ref } from "react"
export const Trigger = forwardRef<HTMLButtonElement, TriggerProps>(function Trigger({ label, onFocus, ...props }, ref) {
  return <button {...props} ref={ref} onFocus={onFocus}>{label}</button>
})
export default function A({ a }: P) { return <Trigger label={a} /> }`,
  'forward ref as the default export': `import { forwardRef } from "react"
export default forwardRef<HTMLInputElement, FieldProps>(function Field({ label, ...props }, ref) {
  return <input {...props} ref={ref} aria-label={label} />
})`,
  'forward ref with whole props object': `import { forwardRef } from "react"
const Box = forwardRef((props: BoxProps, ref) => <div ref={ref}>{props.children}</div>)
export default function A({ a }: P) { return <Box>{a}</Box> }`,
  'forward ref left referenced elsewhere': `import { forwardRef } from "react"
const Wrapped = forwardRef((props, ref) => <p ref={ref}>{props.a}</p>)
const alias = forwardRef
export default function A({ a }: P) { return <Wrapped a={a} /> }`,
  // `cond ? undefined : <A/>` is a one-armed if written inside out.
  'inverted one-armed ternary': `export default function A({ hidden, label }: P) {
  return <p>{hidden ? undefined : label}</p>
}`,

  // Render props: children given as a function the element calls itself.
  // Beast's attribute scanner reads `</` as a regex, so JSX can never stay in
  // an attribute — the function is lifted into a `component` block instead.
  'render prop children': `import { Popup, Tooltip } from "./tooltip"
export default function A({ handle }: P) {
  return <Tooltip.Root handle={handle}>{({ payload }) => <Popup id={payload.id} />}</Tooltip.Root>
}`,
  'render prop capturing a prop': `import { cn } from "./utils"
import { Popup, Portal, Tooltip } from "./tooltip"
export default function A({ className }: P) {
  return (
    <Tooltip.Root>
      {({ payload }) => (
        <Portal>
          {payload ? <Popup className={cn("base", className)}>{payload.label}</Popup> : null}
        </Portal>
      )}
    </Tooltip.Root>
  )
}`,
  'render prop with identifier parameter': `import { List } from "./list"
export default function A({ rows }: P) {
  return <List rows={rows}>{(state) => <li>{state.label}</li>}</List>
}`,
  'render prop with a body and a capture': `import { Chart } from "./chart"
export default function A({ scale }: P) {
  return <Chart>{({ points }) => {
    const scaled = points.map((point) => point * scale)
    return <path d={scaled.join(" ")} />
  }}</Chart>
}`,
  'render prop returning text': `export default function A({}: P) {
  return <Value>{({ amount }) => amount.toFixed(2)}</Value>
}`,
  'render prop taking no parameters': `export default function A({}: P) {
  return <Lazy>{() => <p>ready</p>}</Lazy>
}`,
  // The component the rest are named after is referenced by them, so it cannot
  // become the file's template: it stays `NameRoot` and the template renders it.
  'root named by its siblings': `function DropdownMenu({ ...props }: Root.Props) { return <Root {...props} /> }
function DropdownMenuSub({ ...props }: ComponentProps<typeof DropdownMenu>) { return <DropdownMenu {...props} /> }
export { DropdownMenu, DropdownMenuSub, }`,
  'root only export': `function Menu({ a }: P) { return <p>{a}</p> }
export { Menu }`,
  'root without props': `export default function App() { return <p>hi</p> }`,
  'no root component': `function Foo({ a }: P) { return <p>{a}</p> }
function Bar({ b }: P) { return <p>{b}</p> }
export { Foo, Bar }`,
  // A props type that spans lines continues onto `~` lines, for helpers and the root alike.
  'multiline props type': `function Item({ inset, ...props }: Item.Props & {
  inset?: boolean;
}) { return <div {...props} /> }
export default function A({ a, b }: Base & {
  a: string
  b: number
}) { return <Item inset /> }`,
  // Every line of a multi-line attribute value has to become a continuation.
  'multiline handler attribute': `export default function A({ onOpen }: P) {
  return <Root onOpenChange={(open) => {
    if (!open) {
      onOpen(null)
    }
  }} disabled />
}`,

  // Structure and nesting.
  'nested iteration': `export default function A({ rows, cols }: P) { return <table><tbody>{rows.map(r => <tr key={r.id}>{cols.map(c => <td key={c.id}>{r[c.id]}</td>)}</tr>)}</tbody></table> }`,
  'fragment branch': `export default function A({ a }: P) { return <div>{a ? <><b>x</b><i>y</i></> : <p>n</p>}</div> }`,
  'fragment root': `export default function A({}: P) { return <><h1>t</h1><p>b</p></> }`,
  'elseif chain': `export default function A({ s }: P) { return <div>{s === 'a' ? <A /> : s === 'b' ? <B /> : <C />}</div> }`,
  'guard': `export default function A({ a }: P) { return <div>{a && <p>x</p>}</div> }`,
  'long attribute list': `export default function A({ t }: P) { return <section role='tabpanel' aria-live='polite' aria-labelledby='x' data-state={t} className='grid grid-cols-1 gap-4 rounded-3xl bg-white p-2'>x</section> }`,

  // Text handling.
  'symbols in text': `export default function A({}: P) { return <p>Symbols: {'<'} &amp; {"{}"} stay safe</p> }`,
  'text starting with punctuation': `export default function A({}: P) { return <div><p>.hidden</p><p>#tag</p><p>| pipe</p><p>if else each</p></div> }`,
  'mixed text and element': `export default function A({}: P) { return <p>Hello <b>world</b> now</p> }`,

  // Setup statements.
  'multiline setup': `export default function A({ onSort }: P) {
  const toggle = (id: string) => {
    onSort(id)
  }
  return <button onClick={() => toggle('a')}>go</button>
}`,

  // fragment / style / switch / try — the four block keywords.
  'fragment root with expressions': `export default function A({ h, c }: P) { return <><h1>{h}</h1><p>{c}</p></> }`,
  'style block': `export default function A({ t }: P) {
  return (
    <>
      <article className='card'><h2>{t}</h2></article>
      <style>{\`
        .card { padding: 1rem; }
        :global(body) { margin: 0; }
      \`}</style>
    </>
  )
}`,
  'suspense only': `export default function A({ p }: P) { return <Suspense fallback={<p role='status'>Loading…</p>}><Profile data={p} /></Suspense> }`,
  'boundary string fallback': `export default function A({ p }: P) { return <ErrorBoundary fallback='Failed.'><Thing p={p} /></ErrorBoundary> }`,
  'boundary wrapping suspense': `export default function A({ d }: P) {
  return (
    <ErrorBoundary fallback={(error, reset) => (
      <div role='alert'><p>{error.message}</p><button type='button' onClick={reset}>Retry</button></div>
    )}>
      <Suspense fallback={<p role='status'>Loading…</p>}><Profile data={d} /></Suspense>
    </ErrorBoundary>
  )
}`,
  'switch iife': `export default function A({ kind }: P) {
  return (
    <div>
      {(() => {
        switch (kind) {
          case 'a': return <A />
          case 'b':
          case 'c': return <BC />
          default: return <D />
        }
      })()}
    </div>
  )
}`,
  // Import rewriting: a package with an `@octanejs/*` port moves wholesale, a
  // React symbol moves only if Octane provides it, and the two-statement split
  // that produces still has to parse.
  'octane binding imports': `import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useQuery } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
export default function A({ id }: P) { return <Dialog.Root>{id}</Dialog.Root> }`,
  // Each branch of a ternary can be a loop of its own, and must become `each`
  // rather than a `#{list.map(...)}` holding raw JSX.
  'map in both conditional branches': `export default function A({ lines, code }: P) { return <code>{lines ? lines.map((line, i) => <span key={i} dangerouslySetInnerHTML={{ __html: line }} />) : code.split('\\n').map((line, i) => <span key={\`\${i}-\${line}\`}>{line || ' '}</span>)}</code> }`,
  // Next's default `Link` has no port; TanStack Router's named `Link` stands in.
  'next link import': `import Link from 'next/link'
import NextLink from "next/link"
export default function A({ id }: P) { return <div><Link to={id}>a</Link><NextLink to={id}>b</NextLink></div> }`,
  // `import defer` is a phase modifier, not a type-only flag: it changes when
  // the module evaluates and has to survive the rewrite.
  'deferred namespace import': `import defer * as heavy from "./heavy"
import type { Late } from "./late"
export default function A({ a }: Late) { return <p>{heavy.render(a)}</p> }`,
  'react import split': `import { useState, forwardRef, useMemo as memoize } from 'react'
import { createPortal } from 'react-dom'
export default function A({ id }: P) { const [n] = useState(id); return <p>{memoize(n)}</p> }`,
  // React's type utilities all exist on `octane`, so they are imported from
  // there — but only when the conversion actually references them, and never
  // when a local declaration merely shares the name.
  'react type imports': `import { useState, type ReactNode, type ComponentProps } from 'react'
export default function A({ kids, btn }: { kids: ReactNode; btn: ComponentProps<'button'> }) {
  const [n] = useState<ReactNode>(null)
  return <div>{kids}{n}{btn.type}</div>
}`,
  'react type alias and collision': `import type { ReactNode as Node } from 'react'
interface ProviderProps { kids: Node }
export default function A({ kids }: ProviderProps) { return <div>{kids}</div> }`,
  // Code pasted from a React codebase reaches React through the namespace, with
  // no import to key off. The qualified name is resolved on its own: types,
  // values, and JSX tags alike.
  'react namespace types': `function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot='tabs' className={cn('flex flex-col gap-2', className)} {...props} />
}`,
  'react namespace values': `function A({ kids }: { kids: React.ReactNode; r: React.RefObject<HTMLDivElement> }) {
  const [v] = React.useState<React.ReactNode>(null)
  React.useEffect(() => { console.log(v) }, [v])
  return <React.Fragment>{kids}{v}</React.Fragment>
}`,

  // Requoting printed text turned the apostrophe in a comment into a `"`, which
  // then swallowed every line up to the next quote.
  'apostrophe in comment': `export default function A({ s }: P) {
  const v = useMemo(() => {
    // it's not JSON
    return s
  }, [s])
  return <p>{v}</p>
}`,

  // Every return but the last used to be dumped into setup as raw TSX.
  'guard clause returns': `export default function A({ data, mode }: P) {
  const x = 1
  if (data === null) {
    return <p className='empty'>No data</p>
  }
  if (mode === 'skip') return null
  const label = String(data)
  return <div>{label}{x}</div>
}`,

  // A helper that renders markup becomes a component; its calls become elements.
  'lifted render helper': `export default function A({ items }: P) {
  const [open, setOpen] = useState(false)
  const renderItem = (item: Item, depth: number = 0): React.ReactNode => {
    if (item.children.length === 0) return <span>{item.name}</span>
    return <ul>{item.children.map((child) => <li key={child.id}>{renderItem(child, depth + 1)}</li>)}</ul>
  }
  return <div onClick={() => setOpen(!open)}>{open ? renderItem(items[0]) : null}</div>
}`,

  // A map callback with statements before its return needs a `scope`.
  'map callback setup': `export default function A({ obj }: P) {
  return <ul>{Object.keys(obj).map((key) => {
    const value = obj[key]
    return <li key={key}>{key}: {count} item{count !== 1 ? 's' : ''}</li>
  })}</ul>
}`,

  // The file's component is the file's template, so Beast compiles it straight
  // to the default export instead of a wrapper rendering a renamed component.
  // Signal hooks also need Octane's `nativeReads`, which the check turns on.
  'signals default export': `import { createScope } from 'octane/signals'
import { useSignal$ } from 'octane/signals/client'
// Shared state lives outside the component.
const scope = createScope({ scopeKey: 'playground-signals' })
const shared$ = scope.signal$('count', 0)
export default function App() {
  // Each instance owns its local signal.
  const local$ = useSignal$(10)
  return <button onClick={() => local$.set((count) => count + 1)}>{'Local: ' + local$.get() + shared$.get()}</button>
}`,

  // A React type imported without \`type\` is still a type.
  'react type without type modifier': `import { ReactNode, useState } from 'react'
interface Props { children?: ReactNode }
export default function A({ children }: Props) { const [a] = useState(0); return <div>{children}{a}</div> }`,

  // The renamed root component is renamed where it is referenced, and nowhere
  // else: a string or a label spelling its name keeps it, and a shorthand key
  // keeps the name the app reads it by.
  'root rename leaves text alone': `function Card({ a }: P) { return <p title="Card">Card: {a}</p> }
Card.displayName = "Card"
function CardHeader({ t }: P) { return <h2>Card header {t}</h2> }
export const Parts = { Card, CardHeader }`,

  // A helper lifted out of one component is not in scope in the next.
  'helper scoped to its component': `function List({ xs }: P) {
  const renderRow = (x: string) => <li>{x}</li>
  return <ul>{renderRow(xs[0])}</ul>
}
export default function Table({ xs, renderRow }: Q) { return <div><span />{renderRow(xs)}</div> }`,

  // Every member of an inline object type survives, not just its properties.
  'inline type methods and index signatures': `export default function A({ a }: { a: { onPick(id: string): void; [k: string]: unknown; readonly id: string } }) { return <p>{a.id}</p> }`,

  // Template literal content is a value, not indentation.
  'template literal indentation': `const sql = \`
    select *
        from t
\`
export default function A({ a }: P) {
  const css = \`
    .x {
        color: red;
    }
  \`
  return <p>{a}{sql}{css}</p>
}`,

  // A switch arm with declarations keeps them in a \`scope\`.
  'switch arm with setup': `export default function A({ k }: P) {
  return <div>{(() => { switch (k) { case "a": { const n = 1; return <p>{n}</p> } case "b": return null; default: return <i /> } })()}</div>
}`,

  // Beast binds at most two names; the array argument is read from the iterable.
  'map callback array parameter': `export default function A({ xs }: P) { return <ul>{xs.map((x, i, all) => <li key={i}>{all.length}</li>)}</ul> }`,

  // An overload signature has no \`component\` form; the implementation stands.
  'component overload': `export function Card(p: { a: string }): JSX.Element
export function Card({ a }: { a: string }) { return <p>{a}</p> }`,
}
