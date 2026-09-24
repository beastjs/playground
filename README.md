# Beast Converter

An in-browser playground that converts React **TSX** into
[Beast](https://www.npmjs.com/package/beast-tsrx) **BTSX**, then compiles the
result to **TSRX** and checks it against [Octane](https://octanejs.dev/)'s
compiler. It shows every stage side by side as you type.

```text
TSX (React)  ──convertTsx──▶  BTSX (Beast)  ──Beast codegen──▶  TSRX  ──▶  Octane compiler ✓/✗
```

The converter walks the real TypeScript AST rather than pattern-matching
source text. It reports anything it compiled but could not carry over
faithfully as a structured diagnostic, instead of letting it surface at
runtime.

---

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Scripts](#scripts)
- [Using the converter as a library](#using-the-converter-as-a-library)
- [HTTP API](#http-api)
- [Example](#example)
- [Project structure](#project-structure)
- [Quality gates](#quality-gates)
- [Toolchain](#toolchain)
- [Configuration notes](#configuration-notes)
- [Contributing](#contributing)

---

## Features

- **Three-stage live preview.** Edit TSX and see the BTSX and the compiled
  TSRX update immediately, each with syntax highlighting (Shiki).
- **Compiler verification.** The TSRX panel runs Octane's compiler in the
  browser and shows `octane compiled ✓` or the exact rejection.
- **Conversion diagnostics.** Anything dropped or left for review, such as a
  boundary prop with nowhere to go or an early return with no template form,
  appears as a warning badge with its line and column in the TSX.
- **Size metrics.** Line, token and character counts for each panel, plus
  the character reduction from TSX to BTSX.
- **Bundled samples.** Card, Provider, Dashboard, Palette, Feed and
  Boundary, each covering a different set of conversion rules. Pick one from
  the *Examples* menu.
- **Adaptive layout.**
  - **Desktop:** three resizable panels. A header toggle group shows or hides
    each one.
  - **Mobile:** a snap-paged carousel, one panel per swipe, that still
    scrolls vertically inside each panel.
- **Clipboard integration.** Paste TSX straight into the source panel and copy
  any panel's output.

## Quick start

**Prerequisites:** [Bun](https://bun.sh/) 1.x.

```bash
bun install
bun run dev
```

The dev server starts on rspack's default port (`8080`, or the next free
one). To run on a specific port:

```bash
bun run dev --port 8082
```

## Scripts

| Command | Description |
| --- | --- |
| `bun run dev` | Start the development server with hot reload. |
| `bun run build` | Production build into `dist/`. |
| `bun run preview` | Serve a production-mode build locally. |
| `bun run typecheck` | Typecheck `.ts` and `.btsx` sources with `tsrx-tsc`. |
| `bun test` | Behavioural tests for converter output and diagnostics. |
| `bun run validate` | Push every sample and edge case through Beast's parser, Beast's codegen and Octane's compiler, and compare samples with their golden files. |
| `bun run validate:types` | As above, and also typecheck the generated TSRX. |
| `bun run cf:dev` | Build, then serve the site and the HTTP API with `wrangler dev`. |
| `bun run deploy` | Build and deploy to Cloudflare Workers. |
| `bun run check` | Typecheck, tests, validation and build. **Run before shipping.** |

## Using the converter as a library

The converter is framework-independent and can be imported directly:

```ts
import { convertTsx, convertTsxToBtsx, BtsxConversionError } from '@/lib/tsx-btsx'

try {
  // Just the BTSX:
  const btsx = convertTsxToBtsx(tsxSource)

  // Or the BTSX plus a report of anything it could not carry over:
  const { code, diagnostics } = convertTsx(tsxSource)
  for (const d of diagnostics) {
    console.warn(`${d.line}:${d.column} [${d.code}] ${d.message}`)
  }
} catch (error) {
  // Thrown for input that is not valid TSX.
  if (error instanceof BtsxConversionError) console.error(error.diagnostics)
}
```

Diagnostic codes form a closed union (`ConversionDiagnosticCode`), so callers
can decide which ones to treat as errors. The full rule set, the diagnostic
reference and known limitations are documented in
[converter/README.md](converter/README.md).

## HTTP API

The deployed Worker exposes the same pipeline as the playground at
`POST /api/converter`. Send TSX; get back BTSX, TSRX or both, each with the
panels' metrics, plus whether Beast and Octane compiled the result.

```bash
curl -X POST https://<host>/api/converter \
  -H 'Content-Type: application/json' \
  -d '{ "code": "export default function A() { return <p>hi</p> }", "outputs": ["btsx", "tsrx"] }'
```

`outputs` is optional and defaults to both. The body can also be the raw TSX,
with the selection on the query string: `POST /api/converter?outputs=btsx`.

```jsonc
{
  "ok": true,                                   // Beast and Octane both compiled it
  "input": { "metrics": { "chars": 48, "lines": 1, "tokens": 17 } },
  "outputs": {
    "btsx": { "code": "...", "metrics": { ... }, "diagnostics": [] },
    "tsrx": { "code": "...", "metrics": { ... } } // null code/metrics if Beast failed
  },
  "compilation": {
    "beast":  { "ok": true, "error": null },
    "octane": { "ok": true, "error": null }
  }
}
```

TSRX is compiled from the BTSX, so the compile checks run whichever outputs are
requested. Errors are JSON `{ "error": "..." }`: `400` for a malformed request,
`413` above 256 KiB, `422` for input that is not valid TSX (with its parse
`diagnostics`), `405` for anything but `POST`/`OPTIONS`. CORS is open to any
origin. The handler lives in [`src/lib/api/converter.ts`](src/lib/api/converter.ts)
and the Worker entry in [`worker/index.ts`](worker/index.ts); `bun run cf:dev`
serves both locally.

## Example

The `Card` sample, from TSX:

```tsx
export function Card({ user, unreadCount, messages }: { /* … */ }) {
  return (
    <div className='card'>
      <div className='header'>
        <h1>Welcome, {user.name}</h1>
      </div>
      <div className='body'>
        {user.isAdmin ? <AdminPanel userId={user.id} /> : <p>You have {unreadCount} new messages</p>}
        <ul className='messages'>
          {messages.map((message, i) => (
            <li className='message' key={message.id}>{message.text}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

to BTSX:

```btsx
props { user, unreadCount, messages }: { user: { name: string; id: string; isAdmin: boolean }; unreadCount: number; messages: { id: string; text: string }[] }
.card
  .header
    h1 Welcome, #{user.name}
  .body
    if user.isAdmin
      AdminPanel(userId={user.id})
    else
      p You have #{unreadCount} new messages
    ul.messages
      each message, i in messages key message.id
        li.message #{message.text}
```

The expected output for every sample lives in [`docs/`](docs) and doubles as
the converter's golden fixtures.

## Project structure

```text
.
├── src/
│   ├── App.btsx                  # Page shell: source state and the conversion pipeline
│   ├── main.ts                   # Entry point
│   ├── style.css                 # Tailwind v4 and code-surface / carousel styles
│   ├── components/
│   │   ├── header.btsx
│   │   ├── ui/                   # Shared primitives (Base UI / Radix wrappers)
│   │   └── workspace/            # The converter workspace
│   │       ├── source-panel.btsx     # Editable TSX panel
│   │       ├── output-panel.btsx     # BTSX / TSRX output panel
│   │       ├── desktop-layout.btsx   # Resizable three-panel layout
│   │       ├── mobile-carousel.btsx  # Snap-paged mobile layout
│   │       ├── panel-toggles.btsx    # Panel visibility toggles
│   │       ├── sample-picker.btsx    # Examples menu
│   │       ├── stats.btsx            # Line / token / char metrics
│   │       └── types.ts
│   ├── lib/
│   │   ├── converter/            # TSX → BTSX converter, one module per concern
│   │   ├── tsx-btsx.ts           # Public converter entry point
│   │   ├── tsrx.ts               # BTSX → TSRX → Octane compile check
│   │   ├── metrics.ts            # Size metrics
│   │   ├── api/converter.ts      # POST /api/converter handler
│   │   ├── shiki.ts              # Syntax highlighting (incl. a BTSX grammar)
│   │   └── icons/
│   └── samples/                  # Bundled TSX samples
├── docs/                         # Expected BTSX for each sample (golden files)
├── scripts/
│   ├── validate.ts               # Staged toolchain validation
│   └── edge-cases.ts             # Regression snippets for parser rules
├── worker/index.ts               # Cloudflare Worker: /api/* routes, assets otherwise
├── tests/                        # Converter and API tests
├── converter/README.md           # Converter rule reference
└── rspack.config.ts
```

## Quality gates

A conversion can be wrong in three different ways, and each has its own
check:

1. **It doesn't parse or compile.** `bun run validate` runs each sample
   and edge case through the same three stages a `.btsx` file goes through in
   the app: Beast's parser, Beast's codegen to TSRX, and Octane's compiler.
   Octane rejects several things Beast accepts, so all three stages are
   needed.
2. **It compiles but says the wrong thing.** `bun test` checks the converter's
   actual output and diagnostics.
3. **It drifts over time.** Each sample is compared with its golden file in
   `docs/`.

`bun run check` runs all of these, plus the typecheck and a production build.

## Toolchain

| Package | Version | Role |
| --- | --- | --- |
| `beast-tsrx` | 0.3.2 | BTSX parser, codegen and the rspack integration |
| `octane` | 0.4.3 | Runtime and compiler |
| `@octanejs/rspack-plugin` | 0.1.52 | Octane bundler integration |
| `@rspack/core` | 2.x | Bundler |
| `tailwindcss` | 4.x | Styling |
| `typescript` | 5.9.3 | AST for the converter, bundled into the app |

UI primitives come from `@octanejs/base-ui`, `@octanejs/radix` and
`@octanejs/resizable-panels`.

## Configuration notes

A few non-obvious settings in [`rspack.config.ts`](rspack.config.ts):

- **Root component names.** A `.btsx` file's root component is named after
  the file. Where that would collide with a named export
  (`avatar.btsx`, `fluid-tooltip.btsx`, `button-group.btsx`), the root is
  renamed explicitly through `beastOctane({ components })`.
- **Node shims.** Beast's compiler runs in the browser for the TSRX panel.
  `node:path` and `node:fs` are replaced with shims from `src/lib/shims/`.
- **TypeScript in the browser.** The converter bundles the TypeScript
  compiler, which puts `main.js` at about 5.4 MiB. The performance budget is set
  just above that (6 MiB), so real growth still produces a warning.
  `typescript.js`'s Node-only globals are mocked, and its one computed-`require`
  warning is suppressed, scoped to that file.

- **Worker bundle.** [`wrangler.jsonc`](wrangler.jsonc) bundles the same
  converter for the API. It aliases the same `node:` shims, minifies (about
  1.6 MiB gzipped), and defines `process.browser` so TypeScript does not take
  its Node code path in the Workers runtime.

## Contributing

1. Make the change. If it affects conversion output, add a case to
   `tests/converter.test.ts`. For a new parser rule, add a snippet to
   `scripts/edge-cases.ts`.
2. If a sample's expected output changes on purpose, update its golden file
   in `docs/`.
3. Run `bun run check` and make sure it passes.
4. Record the change in [CHANGELOG.md](CHANGELOG.md) under **Unreleased**.
