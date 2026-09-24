import { BtsxConversionError, convertTsx, type ConversionDiagnostic } from '../tsx-btsx'
import { measure, type Metrics } from '../metrics'
import { compileToTsrx } from '../tsrx'

/**
 * `POST /api/converter`: the playground's pipeline as an HTTP endpoint. TSX in;
 * BTSX, TSRX or both out, each with the same metrics the panels show, plus
 * whether Beast and Octane accepted the result.
 *
 * The body is either JSON, `{ "code": "...", "outputs": ["btsx", "tsrx"] }`, or
 * the raw TSX with `?outputs=btsx,tsrx` on the URL. `outputs` defaults to both.
 * TSRX is compiled from the BTSX, so the whole pipeline runs whichever outputs
 * are asked for; `outputs` only decides what comes back.
 */

export type OutputKind = 'btsx' | 'tsrx'

const OUTPUT_KINDS: readonly OutputKind[] = ['btsx', 'tsrx']

/** Large enough for any real component file, small enough to bound CPU per request. */
export const MAX_SOURCE_BYTES = 256 * 1024

export interface CompileStatus {
  ok: boolean
  /** Why it failed, or null when it compiled. */
  error: string | null
}

export interface ConverterResponse {
  /** True when both Beast and Octane compiled the output. */
  ok: boolean
  input: { metrics: Metrics }
  outputs: {
    btsx?: { code: string; metrics: Metrics; diagnostics: readonly ConversionDiagnostic[] }
    /** `code` and `metrics` are null when Beast could not compile the BTSX. */
    tsrx?: { code: string | null; metrics: Metrics | null }
  }
  compilation: { beast: CompileStatus; octane: CompileStatus }
}

export interface ConverterError {
  error: string
  /** Parse errors in the input, for a 422. */
  diagnostics?: readonly string[]
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

const json = (body: ConverterResponse | ConverterError, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...CORS_HEADERS, ...headers } })

const fail = (status: number, error: string, headers?: Record<string, string>) => json({ error }, status, headers)

export async function handleConverter(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (request.method !== 'POST') return fail(405, 'Use POST.', { Allow: 'POST, OPTIONS' })

  const declared = Number(request.headers.get('Content-Length'))
  if (declared > MAX_SOURCE_BYTES) return fail(413, `Body exceeds ${MAX_SOURCE_BYTES} bytes.`)
  const body = await request.text()
  if (new TextEncoder().encode(body).length > MAX_SOURCE_BYTES) {
    return fail(413, `Body exceeds ${MAX_SOURCE_BYTES} bytes.`)
  }

  const parsed = parseBody(body, request)
  if ('error' in parsed) return fail(400, parsed.error)
  return convert(parsed.code, parsed.outputs)
}

interface ParsedBody {
  code: string
  outputs: ReadonlySet<OutputKind>
}

function parseBody(body: string, request: Request): ParsedBody | { error: string } {
  const isJson = request.headers.get('Content-Type')?.includes('application/json') ?? false
  let code: unknown = body
  let outputs: unknown = new URL(request.url).searchParams.get('outputs')?.split(',')

  if (isJson) {
    let value: unknown
    try {
      value = JSON.parse(body)
    } catch {
      return { error: 'Body is not valid JSON.' }
    }
    if (typeof value !== 'object' || value === null) return { error: 'Body must be a JSON object.' }
    ;({ code, outputs = outputs } = value as { code?: unknown; outputs?: unknown })
  }

  if (typeof code !== 'string') return { error: '`code` must be a string of TSX.' }
  if (code.trim() === '') return { error: '`code` is empty.' }
  if (outputs === undefined) return { code, outputs: new Set(OUTPUT_KINDS) }
  if (typeof outputs === 'string') outputs = [outputs]
  if (!Array.isArray(outputs) || outputs.length === 0) {
    return { error: '`outputs` must be a non-empty list of "btsx" and/or "tsrx".' }
  }
  const kinds = outputs.map((kind) => (typeof kind === 'string' ? kind.trim() : kind))
  const unknown = kinds.filter((kind) => !OUTPUT_KINDS.includes(kind))
  if (unknown.length > 0) return { error: `Unknown output ${JSON.stringify(unknown[0])}; use "btsx" or "tsrx".` }
  return { code, outputs: new Set(kinds as OutputKind[]) }
}

function convert(code: string, outputs: ReadonlySet<OutputKind>): Response {
  let btsx
  try {
    btsx = convertTsx(code)
  } catch (error) {
    if (error instanceof BtsxConversionError) {
      return json({ error: 'Input is not valid TSX.', diagnostics: error.diagnostics }, 422)
    }
    throw error
  }

  const tsrx = compileToTsrx(btsx.code)
  const beast: CompileStatus = tsrx.ok ? { ok: true, error: null } : { ok: false, error: tsrx.output }
  const octane: CompileStatus = !tsrx.ok
    ? { ok: false, error: 'Not run: Beast could not compile the BTSX.' }
    : { ok: tsrx.octaneError === null, error: tsrx.octaneError }

  const response: ConverterResponse = {
    ok: beast.ok && octane.ok,
    input: { metrics: measure(code) },
    outputs: {},
    compilation: { beast, octane }
  }
  if (outputs.has('btsx')) {
    response.outputs.btsx = { code: btsx.code, metrics: measure(btsx.code), diagnostics: btsx.diagnostics }
  }
  if (outputs.has('tsrx')) {
    response.outputs.tsrx = tsrx.ok ? { code: tsrx.output, metrics: measure(tsrx.output) } : { code: null, metrics: null }
  }
  return json(response)
}
