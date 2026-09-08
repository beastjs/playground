# beast-converter

A [Beast](https://www.npmjs.com/package/beast-tsrx) project powered by
[TSRX](https://tsrx.dev/) and [Octane](https://octanejs.dev/).

```bash
bun install
bun run dev
```

`src/App.btsx` is a live TSX → BTSX playground: pick a sample or paste your own
TSX on the left and the converted BTSX appears on the right, with parse errors
surfaced inline. On desktop the two panels are resizable
(`@octanejs/resizable-panels`); on narrower viewports they become a swipeable
carousel that still scrolls vertically inside each panel. The conversion itself lives in
[`src/lib/tsx-btsx.ts`](src/lib/tsx-btsx.ts) — see
[converter/README.md](converter/README.md) for the full rule set and known
limitations.

Edit `src/App.btsx` to get started. Declare typed props at the top of the BTSX
file; the Beast bundler adapter compiles it into native TSRX and then lets Octane
produce the browser module.

Run the complete local verification before shipping:

```bash
bun run check
```

Use `scope` when setup belongs to an exact child position instead of the whole
component:

```btsx
scope
  setup const label = "Owned by this child";
  p #{label}
```

Octane's experimental native-read signal mode remains opt-in. Enable it for
both generated BTSX and native TSRX through the Vite adapter:

```ts
beastOctane({ octane: { nativeReads: true } })
```

Record application changes in [CHANGELOG.md](CHANGELOG.md).

## Selected stack

- Bundler: rspack
- UI: base-ui (@octanejs/base-ui)
- Styling: Tailwind CSS v4

```ts
import { Button } from "@octanejs/base-ui/button";
```
