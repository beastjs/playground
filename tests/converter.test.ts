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
import { BtsxConversionError, convertTsx, convertTsxToBtsx } from '../src/lib/tsx-btsx.ts'

const codes = (source: string) => convertTsx(source).diagnostics.map((d) => d.code)

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
