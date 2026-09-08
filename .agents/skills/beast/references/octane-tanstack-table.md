# Tables with `@octanejs/tanstack-table`

Use this binding for every reusable table or data-grid component. Do not import `@tanstack/react-table`, and do not copy TanStack Table v8 examples: the Octane adapter targets the v9 `useTable` feature API and intentionally omits `useLegacyTable`.

Leaf cells and headers may remain presentational components, but the owning table must get its model, state, and rendering contracts from the binding.

## Core shape

1. Define typed data and column definitions.
2. Opt into only the features the component needs with `tableFeatures`, such as sorting, filtering, pagination, selection, visibility, expanding, grouping, or faceting.
3. Create the table with `useTable({ features, data, columns })`.
4. Render header groups and rows from the table model.
5. Render column header and cell definitions through `flexRender` or `FlexRender`.

Use `createTableHook` and `createTableHookContexts` when building a project-standard table system with reusable cell and table components.

## State and performance

- Pass the optional `useTable` selector to subscribe only to the state slices the owning component renders.
- Use `table.Subscribe` or a table atom for narrower updates lower in the tree.
- Keep column definitions, feature configuration, and stable static data outside render-derived work when their inputs do not change.
- Use controlled table state only when a parent or URL genuinely owns it; otherwise let the table model own it.
- Preserve row identity with a stable domain key when data can reorder or update.
- For server-side sorting, filtering, or pagination, make ownership explicit and avoid applying a conflicting client feature model.

## Semantic and accessible rendering

- Prefer native `table`, `thead`, `tbody`, `tr`, `th`, and `td` structure unless virtualization requires a different layout.
- Give sortable headers a keyboard-operable control and expose sort direction with `aria-sort`.
- Provide a caption or an accessible table name when surrounding context does not already identify it.
- Keep selection controls labeled and expose bulk-selection state correctly.
- Render empty, loading, error, and no-results states deliberately without producing invalid table structure.
- Do not add grid keyboard behavior unless the component is intentionally an interactive ARIA grid and implements the full interaction model.

## Verify

Exercise header and cell rendering, empty data, stable row identity, every enabled feature, controlled-state callbacks when used, keyboard behavior, and loading/error states. For large tables, confirm subscriptions update only the intended region.

## Official references

- [`@octanejs/tanstack-table` README](https://github.com/octanejs/octane/tree/main/packages/tanstack-table)
- [Octane bindings status](https://github.com/octanejs/octane/blob/main/docs/bindings-status.md)
