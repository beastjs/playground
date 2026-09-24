/**
 * The `/api/converter` endpoint: request parsing, output selection, and the
 * metadata it reports. The conversion itself is covered by converter.test.ts.
 *
 *   bun test
 */
import { describe, expect, test } from 'bun:test'
import { handleConverter, MAX_SOURCE_BYTES, type ConverterError, type ConverterResponse } from '../src/lib/api/converter.ts'
import worker from '../worker/index.ts'

const URL_ = 'https://example.test/api/converter'
const SOURCE = `export default function Hello({ name }: { name: string }) {
  return <p>Hello {name}</p>
}`

const post = (body: unknown, query = '') =>
  handleConverter(
    new Request(URL_ + query, {
      method: 'POST',
      headers: { 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
  )

const ok = async (response: Response) => {
  expect(response.status).toBe(200)
  return (await response.json()) as ConverterResponse
}

describe('/api/converter', () => {
  test('returns both outputs by default, with metrics and compile status', async () => {
    const body = await ok(await post({ code: SOURCE }))
    expect(body.ok).toBe(true)
    expect(body.compilation).toEqual({ beast: { ok: true, error: null }, octane: { ok: true, error: null } })
    expect(body.input.metrics.lines).toBe(3)
    expect(body.outputs.btsx?.code).toContain('p Hello #{name}')
    expect(body.outputs.btsx?.diagnostics).toEqual([])
    expect(body.outputs.btsx?.metrics.tokens).toBeGreaterThan(0)
    expect(body.outputs.tsrx?.code).toBeString()
    expect(body.outputs.tsrx?.metrics?.chars).toBeGreaterThan(0)
  })

  test('returns only the outputs asked for', async () => {
    const btsx = await ok(await post({ code: SOURCE, outputs: ['btsx'] }))
    expect(Object.keys(btsx.outputs)).toEqual(['btsx'])
    // Octane's verdict is reported even when TSRX is not returned.
    expect(btsx.compilation.octane.ok).toBe(true)

    const tsrx = await ok(await post({ code: SOURCE, outputs: 'tsrx' }))
    expect(Object.keys(tsrx.outputs)).toEqual(['tsrx'])
  })

  test('accepts raw TSX with outputs on the query string', async () => {
    const body = await ok(await post(SOURCE, '?outputs=tsrx'))
    expect(Object.keys(body.outputs)).toEqual(['tsrx'])
    expect((await ok(await post(SOURCE))).outputs).toContainAllKeys(['btsx', 'tsrx'])
  })

  test('rejects bad requests', async () => {
    const error = async (response: Response, status: number) => {
      expect(response.status).toBe(status)
      return ((await response.json()) as ConverterError).error
    }
    expect(await error(await post({ outputs: ['btsx'] }), 400)).toContain('`code`')
    expect(await error(await post({ code: '  ' }), 400)).toContain('empty')
    expect(await error(await post({ code: SOURCE, outputs: ['jsx'] }), 400)).toContain('"jsx"')
    expect(await error(await post({ code: SOURCE, outputs: [] }), 400)).toContain('non-empty')
    expect(await error(await post('x'.repeat(MAX_SOURCE_BYTES + 1)), 413)).toContain('exceeds')
    expect(await error(await handleConverter(new Request(URL_)), 405)).toContain('POST')

    const malformed = await handleConverter(
      new Request(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })
    )
    expect(await error(malformed, 400)).toContain('JSON')
  })

  test('reports unparseable TSX as 422 with the parse errors', async () => {
    const response = await post({ code: 'export default function () { return <div' })
    expect(response.status).toBe(422)
    const body = (await response.json()) as ConverterError
    expect(body.diagnostics?.length).toBeGreaterThan(0)
  })

  test('answers CORS preflight', async () => {
    const response = await handleConverter(new Request(URL_, { method: 'OPTIONS' }))
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })
})

describe('worker routing', () => {
  const env = { ASSETS: { fetch: async () => new Response('asset') } }

  test('routes the endpoint, 404s other API paths, and serves assets otherwise', async () => {
    const api = await worker.fetch(new Request(URL_, { method: 'POST', body: SOURCE }), env)
    expect(api.status).toBe(200)
    expect((await worker.fetch(new Request('https://example.test/api/nope'), env)).status).toBe(404)
    expect(await (await worker.fetch(new Request('https://example.test/'), env)).text()).toBe('asset')
  })
})
