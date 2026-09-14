/**
 * Verifies the converter against the real toolchain, one stage at a time.
 *
 * Every sample and edge case is converted, then pushed through each stage a
 * `.btsx` file goes through on its way into the app:
 *
 *   1. `parse` from `beast-tsrx` — the parser the compiler and language server
 *      use. This is how the `{...spread}` attribute form and the
 *      one-`props`-per-file rule were found.
 *   2. `compileBeastResult` — Beast's codegen, down to TSRX.
 *   3. `compile` from `octane/compiler` — Octane's own compiler, on that TSRX.
 *      Beast accepts plenty that Octane does not: bare text in an `@if` body is
 *      read as JavaScript, a branch may hold only one JSX root, and a wrapped
 *      `{ ...props, }` is a syntax error. None of that shows up in stage 1.
 *
 * Samples are also compared with their `docs/*.expected.btsx` golden.
 *
 * With `--types`, the samples' TSRX is also written to `.beast/validate` and
 * typechecked with `tsrx-tsc`. Edge cases are skipped there: they are snippets
 * that reference types they never declare.
 *
 *   bun run validate
 *   bun run validate --types
 */
import { compileBeastResult, parse } from 'beast-tsrx'
import { compile } from 'octane/compiler'
import { mkdir, rm } from 'node:fs/promises'
import { convertTsxToBtsx } from '../src/lib/tsx-btsx.ts'
import { OCTANE_OPTIONS } from '../src/lib/tsrx.ts'
import { SAMPLES } from '../src/samples/index.ts'
import { EDGE_CASES } from './edge-cases.ts'

const checkTypes = process.argv.includes('--types')
const typesDir = new URL('../.beast/validate/', import.meta.url)

const firstLine = (error: unknown) => String(error instanceof Error ? error.message : error).split('\n')[0]
const fileStem = (name: string) => name.replace(/[^A-Za-z0-9]+/gu, '-').replace(/^-|-$/gu, '')

interface Stage {
  ok: boolean
  btsx?: string
  tsrx?: string
}

/** Runs one source through every stage, reporting the first that fails. */
function runStages(label: string, stem: string, tsx: string): Stage {
  let btsx: string
  try {
    btsx = convertTsxToBtsx(tsx)
  } catch (error) {
    console.error(`✗ ${label}: conversion threw — ${firstLine(error)}`)
    return { ok: false }
  }

  try {
    parse(btsx, `${stem}.btsx`)
  } catch (error) {
    console.error(`✗ ${label}: Beast rejected the output — ${firstLine(error)}`)
    return { ok: false, btsx }
  }

  let tsrx: string
  try {
    const result = compileBeastResult(btsx, { filename: `${stem}.btsx` })
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
    if (errors.length > 0) {
      console.error(`✗ ${label}: Beast could not compile the output — ${errors[0].code} ${errors[0].message}`)
      return { ok: false, btsx }
    }
    tsrx = result.code
  } catch (error) {
    console.error(`✗ ${label}: Beast could not compile the output — ${firstLine(error)}`)
    return { ok: false, btsx }
  }

  try {
    compile(tsrx, `${stem}.tsrx`, OCTANE_OPTIONS)
  } catch (error) {
    console.error(`✗ ${label}: Octane rejected the compiled TSRX — ${firstLine(error)}`)
    return { ok: false, btsx, tsrx }
  }

  return { ok: true, btsx, tsrx }
}

let failed = 0
const typecheckFiles: { stem: string; tsrx: string }[] = []

for (const sample of SAMPLES) {
  const stage = runStages(sample.id, sample.id, sample.tsx)
  if (!stage.ok || stage.btsx === undefined || stage.tsrx === undefined) {
    failed += 1
    continue
  }

  const golden = Bun.file(new URL(`../docs/${sample.id}.expected.btsx`, import.meta.url))
  if (await golden.exists()) {
    const strip = (text: string) => text.split('\n').filter((line) => line.trim() !== '').join('\n')
    if (strip(await golden.text()) !== strip(stage.btsx)) {
      console.error(`✗ ${sample.id}: output no longer matches docs/${sample.id}.expected.btsx`)
      failed += 1
      continue
    }
  }

  typecheckFiles.push({ stem: sample.id, tsrx: stage.tsrx })
  console.log(`✓ ${sample.id}`)
}

for (const [name, tsx] of Object.entries(EDGE_CASES)) {
  const stage = runStages(`edge: ${name}`, fileStem(name), tsx)
  if (!stage.ok) {
    failed += 1
    continue
  }
  console.log(`✓ edge: ${name}`)
}

if (checkTypes && typecheckFiles.length > 0) {
  await rm(typesDir, { recursive: true, force: true })
  await mkdir(typesDir, { recursive: true })
  for (const { stem, tsrx } of typecheckFiles) {
    await Bun.write(new URL(`${stem}.tsrx`, typesDir), tsrx)
  }
  await Bun.write(
    new URL('tsconfig.json', typesDir),
    JSON.stringify({ extends: '../../tsconfig.json', include: ['./*.tsrx'] }, null, 2)
  )
  const tsc = Bun.spawnSync(['bunx', 'tsrx-tsc', '--noEmit', '-p', new URL('tsconfig.json', typesDir).pathname], {
    stdout: 'pipe',
    stderr: 'pipe'
  })
  const output = `${tsc.stdout.toString()}${tsc.stderr.toString()}`.trim()
  if (tsc.exitCode === 0) {
    console.log(`✓ types: ${typecheckFiles.length} samples typecheck`)
  } else {
    console.error(`✗ types: tsrx-tsc reported errors\n${output}`)
    failed += 1
  }
}

const total = SAMPLES.length + Object.keys(EDGE_CASES).length
if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`)
  process.exit(1)
}
console.log(`\nAll ${total} conversions parse, compile to TSRX, and compile with Octane.`)
