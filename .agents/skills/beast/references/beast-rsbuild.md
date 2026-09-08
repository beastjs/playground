# Beast with Rsbuild

Read this reference only for Rsbuild integration.

```ts
import { defineConfig } from "@rsbuild/core"
import { beastOctane } from "beast-tsrx/rsbuild"

export default defineConfig({
  plugins: beastOctane({
    octane: { strong: true },
  }),
})
```

Without Octane routes, this preserves ordinary Rsbuild entries. With `octane.config.ts`, render routes can target `.btsx` and use Octane's browser hydration and Node SSR environments. Inline options plus project Strong-mode, `nativeReads`, and renderer settings are forwarded to the BTSX transform.

Do not install both `beastOctane()` and a second Octane compiler plugin for the same module graph. Use Rsbuild's Beast-only `beast()` adapter only when `pluginOctane()` is already configured.

Run the project's TSRX-aware typecheck and production Rsbuild build after configuration changes.
