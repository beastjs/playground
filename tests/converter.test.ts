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
