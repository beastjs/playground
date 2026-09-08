# Beast with Vite

Read this reference only for Vite integration.

```ts
import { defineConfig } from "vite"
import { beastOctane } from "beast-tsrx/vite"

export default defineConfig({
  plugins: [
    beastOctane({
      octane: { strong: true },
    }),
  ],
})
```

Import `.btsx` and native `.tsrx` normally. Beast generates TSRX in memory before Octane. The complete adapter honors Octane's HMR, profiling, forced SSR, renderer, exclusion, and directive controls for generated BTSX, selects server lowering during SSR transforms, and routes compiler-split `Hydrate` child queries through the originating `.btsx` module.

Octane's signal engine remains experimental and opt-in. Set
`octane.nativeReads` to enable native reads consistently in generated `.btsx`
and native `.tsrx` modules:

```ts
beastOctane({ octane: { nativeReads: true } })
```

Do not install both `beastOctane()` and a second Octane compiler plugin for the same module graph. Use the Beast-only `beast()` adapter only when the matching Octane integration is already configured.

For Tailwind, place `tailwindcss()` before `beastOctane()` and import Tailwind from the generated stylesheet:

```ts
import tailwindcss from "@tailwindcss/vite"

plugins: [tailwindcss(), beastOctane()]
```

```css
@import "tailwindcss";
```

Run the project's TSRX-aware typecheck and production Vite build after configuration changes. Vite composes the BTSX→TSRX map through Octane so downstream JavaScript locations can trace to authored BTSX.
