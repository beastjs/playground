import { compileBeastResult } from 'beast-tsrx'
import { compile } from 'octane/compiler'

/**
 * The last two stages a converted file goes through before it runs: Beast's
 * codegen down to TSRX, and Octane's compiler on that TSRX. They are the same
 * stages `scripts/validate.ts` checks, run here so the playground shows what
 * Beast emitted and whether Octane accepts it.
 */
export interface TsrxResult {
  /** False when Beast could not compile the BTSX; `output` is then the error. */
  ok: boolean
  output: string
  /** Octane's error for TSRX it rejected, or null when it compiled. */
  octaneError: string | null
}

/**
 * `nativeReads` is Octane's opt-in for signal hooks (`useSignal$` and friends).
 * Without it a file using them is rejected outright, whatever the conversion
 * did, so the check turns it on to judge the conversion rather than the config.
 */
export const OCTANE_OPTIONS = { nativeReads: true }

const firstLine = (error: unknown) => String(error instanceof Error ? error.message : error).split('\n')[0]

export function compileToTsrx(btsx: string): TsrxResult {
  let code: string
  try {
    const result = compileBeastResult(btsx, { filename: 'component.btsx' })
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
    if (errors.length > 0) {
      return { ok: false, output: errors.map((e) => `${e.code}: ${e.message}`).join('\n'), octaneError: null }
    }
    code = result.code
  } catch (error) {
    return { ok: false, output: error instanceof Error ? error.message : String(error), octaneError: null }
  }

  try {
    compile(code, 'component.tsrx', OCTANE_OPTIONS)
    return { ok: true, output: code, octaneError: null }
  } catch (error) {
    return { ok: true, output: code, octaneError: firstLine(error) }
  }
}
