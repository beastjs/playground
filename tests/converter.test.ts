/**
 * Behavioural tests for the converter: what the output says, not just that it
 * compiles. `scripts/validate.ts` proves every conversion survives Beast and
 * Octane; these pin down the cases where valid output was still wrong — text
 * renamed, members dropped, a value's whitespace rewritten — and the
 * diagnostics that report what a conversion could not carry over.
 *
 *   bun test
 */
import { describe, expect, test } from 'bun:test'
import { compileBeastResult } from 'beast-tsrx'
import { compile } from 'octane/compiler'
import { compileToTsrx } from '../src/lib/tsrx.ts'
import { BtsxConversionError, convertTsx, convertTsxToBtsx } from '../src/lib/tsx-btsx.ts'

const codes = (source: string) => convertTsx(source).diagnostics.map((d) => d.code)

describe('current Octane toolchain', () => {
  test('signal types and reads survive conversion without compiler flags', () => {
    const result = convertTsx(`import { signal$, type WritableSignal } from 'octane/signals'
import type { SignalHandle as Handle } from 'octane/signals'
const count$: WritableSignal<number> = signal$(0)
export default function A({ value }: { value: Handle<number> }) {
  return <button onClick={() => count$.set(count$.get() + 1)}>{count$.get()}{value.get()}</button>
}`)
    expect(result.diagnostics).toEqual([])
    expect(result.code).toContain('import { signal$, type WritableSignal } from "octane/signals";')
    expect(result.code).toContain('import type { SignalHandle as Handle } from "octane/signals";')
    expect(compileToTsrx(result.code)).toMatchObject({ ok: true, octaneError: null })
    const { code } = compileBeastResult(result.code, { filename: 'Signals.btsx' })
    for (const mode of ['client', 'server'] as const) {
      expect(() => compile(code, 'Signals.tsrx', { mode })).not.toThrow()
    }
  })

  test('default, namespace, and ported type imports remain available to props', () => {
    const output = convertTsxToBtsx(`import type Model from './model'
import type * as Types from './types'
import { type ButtonProps, Button } from '@base-ui/react/button'
export default function A({ item }: { item: Model & Types.Item & ButtonProps }) { return <Button>{item.id}</Button> }`)
    expect(output).toContain('import type Model from "./model";')
    expect(output).toContain('import type * as Types from "./types";')
    expect(output).toContain('import { type ButtonProps, Button } from "@octanejs/base-ui/button";')
  })

  test.each(['input', 'textarea', 'input type="text"', 'input type={"number"}', 'input type="search"'])(
    '%s updates on every edit without a native-change warning', (tag) => {
      const result = convertTsx(`import { useState } from 'react'
export default function A() {
  const [value, setValue] = useState('')
  return <${tag} value={value} onChange={event => setValue(event.currentTarget.value)} />
}`)
      expect(result.diagnostics).toEqual([])
      expect(result.code).toContain('onInput=')
      expect(result.code).not.toContain('onChange=')
      const { code } = compileBeastResult(result.code, { filename: 'Input.btsx' })
      expect(compile(code, 'Input.tsrx').diagnostics).toEqual([])
    }
  )

  test.each(['input type="checkbox"', 'input type="radio"', 'select', 'Field', 'custom-field',
    'input suppressNativeChangeWarning'])(
    '%s keeps its change handler', (tag) => {
      const result = convertTsx(`export default function A() { return <${tag} onChange={handleChange} /> }`)
      expect(result.diagnostics).toEqual([])
      expect(result.code).toContain('onChange={handleChange}')
    }
  )

  test.each(['input type={kind}', 'input {...props}', 'textarea onInput={handleInput}'])(
    '%s reports ambiguous handlers without overwriting them', (tag) => {
      const result = convertTsx(`export default function A() { return <${tag} onChange={handleChange} /> }`)
      expect(result.code).toContain('onChange={handleChange}')
      expect(result.diagnostics).toMatchObject([{ code: 'native-change-handler', line: 1 }])
      if (tag.includes('onInput')) expect(result.code).toContain('onInput={handleInput}')
    }
  )
})

describe('input handling', () => {
  test.each([
    ['<div><p>Hello</div>', 'div\n  p Hello\n'],
    ['<ul><li>one<li>two</ul>', 'ul\n  li one\n  li two\n'],
    ['<div><span>hi', 'div\n  span hi\n'],
    ['<input>', 'input\n'],
    ['<div><input><span>Hi</span></div>', 'div\n  input\n  span Hi\n'],
    ['export default function A() { return <div><span>hi</div> }', '\ndiv\n  span hi\n']
  ])('repairs missing HTML tags in %s', (source, expected) => {
    const result = convertTsx(source)
    expect(result.code).toBe(expected)
    expect(compileToTsrx(result.code)).toMatchObject({ ok: true, octaneError: null })
  })

  test('a missing component tag still reports a parse error', () => {
    expect(() => convertTsx('<Widget>hello')).toThrow(BtsxConversionError)
  })

  test('repairs an omitted div close in an indented component', () => {
    const result = convertTsx(`export function Card({
  user,
  unreadCount,
  messages
}: {
  user: { name: string; id: string; isAdmin: boolean }
  unreadCount: number
  messages: { id: string; text: string }[]
}) {
  return (
    <div className='card'>
      <div className='header'>
        <h1>Welcome, {user.name}</h1>
      
      <div className='body'>
        {user.isAdmin ? <AdminPanel userId={user.id} /> : <p>You have {unreadCount} new messages</p>}
        <ul className='messages'>
          {messages.map((message, i) => (
            <li className='message' key={message.id}>
              {message.text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}`)
    expect(result.code).toContain('  .header\n    h1 Welcome, #{user.name}\n  .body')
    expect(compileToTsrx(result.code)).toMatchObject({ ok: true, octaneError: null })
  })

  test('pasted HTML comments are removed while string style props survive', () => {
    const result = convertTsx('<button type="button" style="display: flex;  1.67772e+07px; appearance: button;">BTSX<!----></button>')
    expect(result.code).toBe('button(type="button" style="display: flex;  1.67772e+07px; appearance: button;") BTSX\n')
    expect(result.diagnostics).toEqual([])
    expect(compileToTsrx(result.code)).toMatchObject({ ok: true, octaneError: null })
  })

  test('named, multiline, repeated and surrounding HTML comments disappear', () => {
    const result = convertTsx('<!-- before --><button>A<!-- marker -->B<!-- first\nsecond --><span>OK</span><!----></button><!-- after -->')
    expect(result.code).not.toContain('<!--')
    expect(result.code).toContain('  span OK')
    expect(result.code).not.toContain('marker')
    expect(compileToTsrx(result.code)).toMatchObject({ ok: true, octaneError: null })
    expect(convertTsxToBtsx('<p>A<!---->B</p>')).toBe('p AB\n')
  })

  test('HTML comment syntax inside literals and TS comments is preserved', () => {
    const result = convertTsx(`const marker = "<!-- string -->"
const template = \`<!-- template -->\`
const pattern = /<!-- regex -->/
// <!-- line comment -->
export default function A() {
  return <button title="<!-- attribute -->">{"<!-- expression -->"}{/* <!-- JSX comment --> */}<!----></button>
}`)
    for (const content of ['<!-- string -->', '<!-- template -->', '<!-- regex -->', '<!-- line comment -->', '<!-- attribute -->', '<!-- expression -->']) {
      expect(result.code).toContain(content)
    }
    expect(result.code).not.toContain('<!---->')
    expect(result.diagnostics).toEqual([])
    expect(compileToTsrx(result.code)).toMatchObject({ ok: true, octaneError: null })
  })

  test('a pasted element begins with its selector and preserves its child', () => {
    const result = convertTsx(`<button type="button"><span className="items-center flex justify-center mr-3 ">OK</span></button>`)
    expect(result.code).toBe('button(type="button")\n  span(className="items-center flex justify-center mr-3 ") OK\n')
    expect(result.diagnostics).toEqual([])
    expect(compileToTsrx(result.code)).toMatchObject({ ok: true, octaneError: null })
  })

  test.each(['<button />', '(<button />);', '<>{/* comment */}<button /></>'])(
    'a standalone single root needs no wrapper: %s', (source) => {
      expect(convertTsxToBtsx(source)).toBe('button\n')
    }
  )

  test.each([
    'style={{ padding: "1rem", opacity: 0.5, "--accent": "purple" }}',
    'style={styles}',
    'style={{ ...styles, color: active ? "red" : "blue" }}'
  ])('inline style props remain expressions: %s', (attribute) => {
    for (const source of [
      `<button ${attribute}>OK</button>`,
      `export default function A() { return <button ${attribute}>OK</button> }`
    ]) {
      const result = convertTsx(source)
      expect(result.code).toContain(attribute)
      expect(result.diagnostics).toEqual([])
      expect(compileToTsrx(result.code)).toMatchObject({ ok: true, octaneError: null })
    }
  })

  test('a pasted fragment keeps scoped CSS beside its element', () => {
    const result = convertTsx(`<>
  <article className="card" {...cardProps}>
    <h2>{title}</h2>
    <p>Scoped styling follows this component.</p>
  </article>
  <style>{/* scoped CSS */}{(\`
    .card {
      padding: 1rem;
    }

    .card h2 {
      color: rebeccapurple;
    }

    :global(body) {
      margin: 0;
    }
  \`)}</style>
</>`)
    expect(result.code).toBe(`fragment
  article.card({...cardProps})
    h2 #{title}
    p Scoped styling follows this component.
  style
    .card {
      padding: 1rem;
    }

    .card h2 {
      color: rebeccapurple;
    }

    :global(body) {
      margin: 0;
    }
`)
    expect(result.diagnostics).toEqual([])
    expect(compileToTsrx(result.code)).toMatchObject({ ok: true, octaneError: null })
  })

  test('standalone JSX can lift element props before the template', () => {
    const result = convertTsx('<Toggle icon={<b>Icon</b>} />')
    expect(result.code).toContain('component Icon\n  b Icon')
    expect(result.code).toContain('Toggle(icon={createElement(Icon, {})})')
    expect(compileToTsrx(result.code)).toMatchObject({ ok: true, octaneError: null })
  })

  test('invalid TSX throws with located diagnostics', () => {
    expect(() => convertTsxToBtsx('export default function A( { return <div> }')).toThrow(BtsxConversionError)
    try {
      convertTsxToBtsx('const = ;')
    } catch (error) {
      expect((error as BtsxConversionError).diagnostics[0]).toMatch(/^1:\d+ /u)
    }
  })

  test('a faithful conversion reports nothing', () => {
    const result = convertTsx(`export default function A({ a }: { a: string }) { return <p>{a}</p> }`)
    expect(result.diagnostics).toEqual([])
    expect(result.code).toBe('\nprops { a }: { a: string }\np #{a}\n')
  })
})

describe('renaming the file component', () => {
  const output = convertTsxToBtsx(`function Card({ a }: P) { return <p title="Card">Card: {a}</p> }
Card.displayName = "Card"
function CardHeader({ t }: P) { return <h2>Card header {t}</h2> }
export const Parts = { Card, CardHeader }`)

  test('references follow the new name', () => {
    expect(output).toContain('CardRoot.displayName')
    expect(output).toContain('component CardRoot')
    expect(output).toContain('CardRoot({...props})')
  })

  test('strings and JSX text keep the old name', () => {
    expect(output).toContain('= "Card";')
    expect(output).toContain('p(title="Card") Card: #{a}')
    expect(output).toContain('h2 Card header #{t}')
  })

  test('a shorthand property keeps its key', () => {
    expect(output).toContain('{ Card: CardRoot, CardHeader }')
  })
})

describe('React names', () => {
  test('a React type is renamed where it is used as a type, not inside a string', () => {
    const output = convertTsxToBtsx(`import type { ReactNode } from "react"
export default function A({ a }: { a: ReactNode }) { const label = "ReactNode"; return <p>{label}{a}</p> }`)
    expect(output).toContain('props { a }: { a: OctaneNode }')
    expect(output).toContain('const label = "ReactNode";')
    expect(output).toContain('import type { OctaneNode } from "octane";')
  })

  test('React.member resolves onto Octane and an unknown one is reported', () => {
    const result = convertTsx(`export default function A() { const [a] = React.useState(0); React.unstable_nope(); return <p>{a}</p> }`)
    expect(result.code).toContain('const [a] = useState(0);')
    expect(result.code).toContain('import { useState } from "octane";')
    expect(result.diagnostics.map((d) => d.code)).toEqual(['unresolved-react-member'])
  })

  test('a context is rendered as its own provider, and another .Provider is left alone', () => {
    const result = convertTsx(`import * as React from 'react'
import { createContext as cc } from 'react'
import * as Tooltip from '@radix-ui/react-tooltip'
const A = React.createContext(0)
const B = cc('x')
export default function X({ children }: { children: React.ReactNode }) {
  const provided = <A.Provider value={2}>{children}</A.Provider>
  return <Tooltip.Provider><A.Provider value={1}><B.Provider value='y'>{provided}</B.Provider></A.Provider></Tooltip.Provider>
}`)
    expect(result.diagnostics).toEqual([])
    expect(result.code).not.toContain('A.Provider')
    expect(result.code).not.toContain('B.Provider')
    expect(result.code).toContain('Tooltip.Provider')
    expect(result.code).toContain('A(value={1})')
    expect(result.code).toContain('B(value="y")')
  })
})

describe('async components', () => {
  test('an await in the component body reads the promise with use()', () => {
    const result = convertTsx(`const data = load()
export default async function A() {
  const { rows } = (await data).page
  const onClick = async () => { await save() }
  return <p onClick={onClick}>{rows.length}</p>
}`)
    expect(result.code).toContain('import { use } from "octane";')
    expect(result.code).toContain('const { rows } = use(data).page;')
    expect(result.code).toContain('const onClick = async () => { await save(); };')
    expect(result.diagnostics).toEqual([])
    expect(compileToTsrx(result.code).octaneError).toBeNull()
  })

  test('an existing use import is reused, and a promise made during render is reported', () => {
    const result = convertTsx(`import { use as read } from 'react'
export default async function A({ id }: { id: string }) { const u = await fetchUser(id); return <p>{u}</p> }`)
    expect(result.code).toContain('import { use as read } from "octane";')
    expect(result.code).toContain('const u = read(fetchUser(id));')
    expect(result.diagnostics.map((d) => d.code)).toEqual(['uncached-use-promise'])
  })
})

describe('lifted helpers', () => {
  test('a helper is only mounted inside the component that declared it', () => {
    const output = convertTsxToBtsx(`function List({ xs }: P) {
  const renderRow = (x: string) => <li>{x}</li>
  return <ul>{renderRow(xs[0])}</ul>
}
export default function Table({ xs, renderRow }: Q) { return <div><span />{renderRow(xs)}</div> }`)
    expect(output).toContain('    RenderRow(x={xs[0]})')
    expect(output).toContain('  | #{renderRow(xs)}')
  })

  test('an untyped lifted component is reported', () => {
    expect(codes(`export default function A({ items }: P) {
  return <Root>{(state) => <p>{state.label}{items.length}</p>}</Root>
}`)).toContain('untyped-props')
  })
})

describe('element attributes', () => {
  test('an element passed as an attribute is lifted into a component block', () => {
    const result = convertTsx(`import { Icon } from './icon'
export default function A({ tone, size = 2 }: { tone?: string; size?: number }) {
  return <Toggle on={true} icon={<Icon className={tone} size={size} />} empty={<><b>x</b><i /></>} />
}`)
    expect(result.code).toContain('component Icon2')
    expect(result.code).toContain('  props { tone, size }: { tone?: string; size: number }\n  Icon(className={tone} size={size})')
    expect(result.code).toContain('icon={createElement(Icon2, { tone, size })}')
    expect(result.code).toContain('empty={createElement(Empty, {})}')
    expect(result.code).toContain('import { createElement } from "octane";')
    expect(result.code).not.toMatch(/=\{</u)
    expect(result.diagnostics).toEqual([])
    expect(compileToTsrx(result.code).octaneError).toBeNull()
  })

  test('a captured setup value cannot be typed and is reported', () => {
    expect(codes(`export default function A({ a }: { a: string }) {
  const label = a.trim()
  return <Toggle icon={<b>{label}</b>} />
}`)).toEqual(['untyped-props'])
  })
})

describe('types', () => {
  test('an inline object type keeps methods, index signatures and readonly', () => {
    const output = convertTsxToBtsx(
      `export default function A({ a }: { a: { onPick(id: string): void; [k: string]: unknown; readonly id: string } }) { return <p>{a.id}</p> }`
    )
    expect(output).toContain('{ a: { onPick(id: string): void; [k: string]: unknown; readonly id: string } }')
  })
})

describe('printed statements', () => {
  test('template literal content keeps its own indentation', () => {
    const output = convertTsxToBtsx(`const sql = \`
    select *
        from t
\`
export default function A({ a }: P) { return <p>{a}</p> }`)
    // Two spaces of `module` block indent, then the literal's own four and eight.
    expect(output).toContain('\n      select *\n          from t\n  `;')
  })

  test('code around a template literal is still re-indented', () => {
    const output = convertTsxToBtsx(`function helper() {
    if (ok) {
        return \`a
  b\`
    }
}
export default function A({ a }: P) { return <p>{a}</p> }`)
    // The printer's four-space levels become two; the literal's `  b` gains only the block indent.
    expect(output).toContain('\n    if (ok) {\n      return `a\n    b`;')
  })

  test('a comment spanning several lines is kept whole', () => {
    const output = convertTsxToBtsx(`// unrelated

// first line
// second line
export default function A({ a }: P) { return <p>{a}</p> }`)
    expect(output).toContain('// first line\n// second line')
    expect(output).not.toContain('unrelated')
  })
})

describe('template blocks', () => {
  test('a switch arm keeps the declarations before its return', () => {
    const output = convertTsxToBtsx(`export default function A({ k }: P) {
  return <div>{(() => { switch (k) { case "a": { const n = 1; return <p>{n}</p> } default: return <i /> } })()}</div>
}`)
    expect(output).toContain('    case "a"\n      scope\n        setup const n = 1;\n        p #{n}\n    default\n      i')
  })

  test('a switch arm with no template form is reported', () => {
    expect(codes(`export default function A({ k }: P) {
  return <div>{(() => { switch (k) { case "a": track(); break; default: return <i /> } })()}</div>
}`)).toEqual(['unconverted-switch-case'])
  })

  test('boundary props that have no place on try are reported', () => {
    const result = convertTsx(`export default function A() { return <ErrorBoundary fallback={<p>x</p>} onReset={reset}><B /></ErrorBoundary> }`)
    expect(result.code).toContain('try\n  B\ncatch\n  p x')
    expect(result.diagnostics).toMatchObject([{ code: 'dropped-boundary-prop', line: 1 }])
  })

  test('a map callback array parameter is bound from the iterable', () => {
    const output = convertTsxToBtsx(`export default function A({ xs }: P) { return <ul>{xs.map((x, i, all) => <li key={i}>{all.length}</li>)}</ul> }`)
    expect(output).toContain('each x, i in xs key i\n    scope\n      setup const all = xs;')
    expect(codes(`export default function A() { return <ul>{load().map((x, i, all) => <li>{all.length}</li>)}</ul> }`)).toEqual([
      'reevaluated-iterable'
    ])
  })

  test('two destructured loop parameters get distinct names', () => {
    const output = convertTsxToBtsx(`export default function A({ xs }: P) { return <ul>{xs.map(({ a }, [b]) => <li>{a}{b}</li>)}</ul> }`)
    expect(output).toContain('each item, item2 in xs')
  })

  test('an early return the template cannot express is reported', () => {
    expect(codes(`export default function A({ xs }: P) {
  for (const x of xs) { if (x) return <b /> }
  return <i />
}`)).toEqual(['unconverted-early-return'])
  })
})

describe('components', () => {
  test('an overload signature is dropped in favour of the implementation', () => {
    const result = convertTsx(`export function Card(p: { a: string }): JSX.Element
export function Card({ a }: { a: string }) { return <p>{a}</p> }`)
    expect(result.code).toBe('\nprops { a }: { a: string }\np #{a}\n')
    expect(result.diagnostics.map((d) => d.code)).toEqual(['dropped-overload'])
  })
})
