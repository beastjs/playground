/**
 * React-shaped type names for Octane code.
 *
 * Octane already ships the whole surface: its root entry does
 * `export type * from './public-types.js'`, which restates React's types —
 * `ComponentProps`, `RefObject`, `FC`, `Dispatch`, the `*HTMLAttributes` and
 * DOM event families — in terms of Octane values and native DOM events. So
 * these are re-exports, not reimplementations, and `ReactNode` is deliberately
 * absent: Octane keeps it only as a migration alias for `OctaneNode`.
 *
 * Add to this file only what Octane does not already provide; the converter
 * resolves React type imports straight to `octane` (see `octane-bindings.ts`).
 */
export type {
  ComponentProps,
  ComponentPropsWithoutRef,
  ComponentType,
  Dispatch,
  FC,
  OctaneNode,
  Ref,
  RefObject,
  SetStateAction
} from "octane";
