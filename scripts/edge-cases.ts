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
  'object type alias': `type Late = { a: string; b: { c: number } }
export default function A({ a }: Late) { return <p>{a}</p> }`,
  'module after component': `function H() { return <p>h</p> }
type Late = { a: string }
export default function A({ a }: Late) { return <div><H /></div> }`,

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
  'fragment root': `export default function A({ h, c }: P) { return <><h1>{h}</h1><p>{c}</p></> }`,
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
}
