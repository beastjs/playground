# Beast with Rspack

Read this reference only for Rspack integration.

```js
import { beastOctane } from "beast-tsrx/rspack"

export default {
  entry: "./src/main.ts",
  plugins: [
    beastOctane({
      octane: { strong: true },
    }),
  ],
}
```

The adapter selects client or server output from the Rspack target, registers source dependencies for caching and watch mode, and resolves compiler-split `.tsrx` hydration requests back to `.btsx` while preferring a real native `.tsrx` file.

Compiler-level `nativeReads` is forwarded to Beast's generated-TSRX loader as
well as Octane's native-source plugin.

Do not install both `beastOctane()` and a second Octane compiler plugin for the same module graph. `BeastRspackPlugin` and the Beast-only `beast()` adapter are available when `OctaneRspackPlugin` is already configured separately.

Run the project's TSRX-aware typecheck and production Rspack build after configuration changes. Rspack composes the BTSX→TSRX map through Octane and through an earlier input map when present.
