# Beast scaffolding and CLI

Read this reference when creating a Beast app, compiling a component, building or watching a source tree, or using the programmatic compiler.

Prefer the project's installed Beast version and package manager. Beast and Octane are alpha software; `beast-tsrx` pins compatible peers.

## Scaffold

Create a Vite app with Bun:

```bash
bun create beast@latest [directory]
bun x create-beast@latest [directory]
```

| Option | Effect |
| --- | --- |
| `--tailwind` | Use the Tailwind CSS template |
| `--bundler vite\|rspack\|rsbuild` | Select the build tool (default: Vite) |
| `--ui base-ui\|radix\|shadcn` | Select the Octane UI binding; shadcn enables Tailwind |
| `--no-install` | Skip dependency installation |
| `--no-git` | Skip `git init` |
| `--force` | Write known template files into a non-empty directory without deleting unrelated files |
| `-h`, `--help` | Print help |

Inspect a non-empty target before using `--force`. The base and Tailwind templates include typed `src/App.btsx`, `src/main.ts`, styles, `vite.config.ts` with `beastOctane()`, a TSRX-aware `tsconfig.json`, and a project-owned `CHANGELOG.md`. The Tailwind template also configures `@tailwindcss/vite` and `@import "tailwindcss"`. `create-beast@0.2.60` uses the latest published `beast-tsrx` (`0.2.60` for this release), pins `octane@0.2.6`, and demonstrates scoped child setup.

## Compile and build

After `beast-tsrx` is installed:

```text
beast compile <input.btsx> [options]
beast <input.btsx> [output.tsrx] [options]
beast build [source-directory] [options] [--watch]
beast --help
```

Compile one component:

```bash
bunx beast compile src/Card.btsx --output /tmp/Card.tsrx
```

| Option | Meaning | Default |
| --- | --- | --- |
| `-o`, `--output PATH` | output TSRX path | input path with `.tsrx` |
| `--component-name NAME` | generated component identifier | derived from filename |
| `--props PARAMETER` | complete function parameter and type | source `props` or empty list |
| `--no-validate` | skip Octane validation | validation enabled |

Build or watch a tree:

```bash
bunx beast build src --out-dir .beast
bunx beast build src --out-dir .beast --watch
```

The builder finds `.btsx` and native `.tsrx`, mirrors generated TSRX under the output directory, validates native TSRX in place, and writes `beast-manifest.json`. It ignores common vendor and output directories. Successful builds remove only canonical tracked stale `.tsrx` outputs inside the output directory.

Watch mode debounces and serializes rebuilds, excludes the output tree, reports failures without exiting, and retries after the next source change. Use it only for requested long-running development behavior.

For an application, prefer its configured scripts. A create-beast app normally provides:

```bash
bun run check      # TSRX-aware typecheck plus production build
bun run typecheck  # tsrx-tsc --noEmit
bun run build      # configured application bundler
```

## Programmatic API

```ts
import { buildBeastProject, compileBeastResult, watchBeastProject } from "beast-tsrx"

const compiled = compileBeastResult(source, { filename: "Card.btsx" })
const build = await buildBeastProject({ root: "src", outDir: ".beast" })
const watcher = watchBeastProject({ root: "src", outDir: ".beast" })
await watcher.ready
// Later: await watcher.close()
```

`compileBeastResult()` returns code, the public AST, diagnostics, and a source map. Use emitted output and mappings as evidence; edit the BTSX source.
