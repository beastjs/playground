/**
 * Verifies the converter against the real Beast parser.
 *
 * Every sample is converted and the result is fed to `parse` from `beast-tsrx`,
 * which is the same parser the compiler and language server use. That turns
 * "the output looks right" into "the output is accepted by Beast", and is how
 * the `{...spread}` attribute form and the one-`props`-per-file rule were found.
 *
 *   bun run validate
 */
import { parse } from 'beast-tsrx'
import { convertTsxToBtsx } from '../src/lib/tsx-btsx.ts'
import { SAMPLES } from '../src/samples/index.ts'
import { EDGE_CASES } from './edge-cases.ts'

let failed = 0

for (const sample of SAMPLES) {
  let btsx: string
  try {
    btsx = convertTsxToBtsx(sample.tsx)
  } catch (error) {
    console.error(`✗ ${sample.id}: conversion threw — ${(error as Error).message}`)
    failed += 1
    continue
  }

  try {
    parse(btsx, `${sample.id}.btsx`)
  } catch (error) {
    const message = String((error as Error).message).split('\n')[0]
    console.error(`✗ ${sample.id}: Beast rejected the output — ${message}`)
    failed += 1
    continue
  }

  const golden = Bun.file(new URL(`../docs/${sample.id}.expected.btsx`, import.meta.url))
  if (await golden.exists()) {
    const strip = (text: string) => text.split('\n').filter((line) => line.trim() !== '').join('\n')
    if (strip(await golden.text()) !== strip(btsx)) {
      console.error(`✗ ${sample.id}: output no longer matches docs/${sample.id}.expected.btsx`)
      failed += 1
      continue
    }
  }

  console.log(`✓ ${sample.id}`)
}

for (const [name, tsx] of Object.entries(EDGE_CASES)) {
  try {
    parse(convertTsxToBtsx(tsx), 'edge.btsx')
    console.log(`✓ edge: ${name}`)
  } catch (error) {
    console.error(`✗ edge: ${name} — ${String((error as Error).message).split('\n')[0]}`)
    failed += 1
  }
}

if (failed > 0) {
  console.error(`\n${failed} sample(s) failed.`)
  process.exit(1)
}
console.log(`\nAll ${SAMPLES.length} samples and ${Object.keys(EDGE_CASES).length} edge cases parse as valid Beast.`)
