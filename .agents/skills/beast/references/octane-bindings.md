# Octane bindings for design systems and UI libraries

Read this reference when the user names a design system, component library, React hook library, or React-facing UI package. Preserve the requested system; do not silently substitute another one.

## Decide whether a binding is needed

1. Inspect the project's `package.json`, adjacent components, styling utilities, and existing imports.
2. Check the current [Octane bindings directory](https://octanejs.dev/docs/bindings) for the named package or its underlying primitives.
3. If the package exposes React hooks or components and an Octane binding exists, use its `@octanejs/*` package instead of the React-facing import.
4. Read that binding's README and status entry for the exact hook/component surface, known differences, and SSR/hydration coverage needed by the task.
5. If the package is framework-agnostic—CSS, design tokens, icons as data, validators, date utilities, or an API client—use it directly unless its own documentation says otherwise.

Common UI bindings include `@octanejs/radix`, `@octanejs/base-ui`, `@octanejs/aria`, `@octanejs/zag`, `@octanejs/shadcn`, `@octanejs/mantine-hooks`, `@octanejs/motion`, `@octanejs/sonner`, `@octanejs/cmdk`, `@octanejs/lucide`, and `@octanejs/phosphor-icons`. This is a routing aid, not a complete or permanent inventory; verify the live directory.

## Required project defaults

- For any form, form section, form-aware field, validation flow, or submission UI, use `@octanejs/tanstack-form`. Read [octane-tanstack-form.md](octane-tanstack-form.md).
- For any reusable table or data-grid component, use `@octanejs/tanstack-table`. Read [octane-tanstack-table.md](octane-tanstack-table.md).
- Never substitute `@tanstack/react-form` or `@tanstack/react-table`; those adapters target React.
- A purely presentational input, cell, or control may stay framework-neutral, but it must compose with the relevant Octane binding and must not create a competing form or table state model.

## Integration rules

- Keep the upstream design system's component model, accessibility behavior, tokens, and documented composition unless an Octane binding documents a difference.
- Change the import boundary, not the user's product choice. For example, use `@octanejs/radix` for supported Radix primitives instead of inventing replacements.
- Do not invent a binding API from the upstream React package. Inspect the installed types or binding README before authoring.
- Check that every required primitive or hook is actually included. Binding maturity ranges from complete ports to partial or technical-preview surfaces.
- For SSR work, verify server rendering and hydration coverage for the exact surface used.
- Do not confuse library bindings with app tooling. Vite, Rspack, and Rsbuild compiler integrations remain separate.
- Install or replace dependencies only when the user's build request authorizes it. For review or planning, report the required package without mutating dependencies.
- If no suitable binding exists, explain the gap and preserve the user's design requirements. Ask before replacing the requested library or undertaking a material port.

## Example import boundary

```ts
// React-facing package
import { create } from "zustand"

// Octane binding
import { create } from "@octanejs/zustand"
```

Use upstream documentation for the library's public API and the binding README for Octane-specific differences.

## Official references

- [Octane bindings directory](https://octanejs.dev/docs/bindings)
- [Octane bindings status](https://github.com/octanejs/octane/blob/main/docs/bindings-status.md)
- [Octane build tools](https://octanejs.dev/docs/build-tools)
