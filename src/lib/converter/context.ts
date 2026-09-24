/** The state one conversion carries from the first statement to the last. */

import ts from 'typescript'
import type { ConversionDiagnostic } from './diagnostics'

export interface ConvertContext {
  sourceFile: ts.SourceFile
  sourceText: string
  /**
   * React types this file imported, keyed by the name the code uses: how to
   * render a reference to it, and how to import it from `octane`.
   */
  reactTypes: Map<string, { render: string; importText: string }>
  /** Of those, the ones the output actually references — only they get imported. */
  octaneTypeImports: Map<string, string>
  /** Value imports the conversion resolved onto Octane, keyed by module. */
  octaneImports: Map<string, Map<string, string>>
  /** Every name the file declares at module scope, so a lifted render prop
   * can tell what it closed over from what is simply in scope. */
  moduleScope: Set<string>
  /** Module-scope names in use, including the ones this conversion generates. */
  takenNames: Set<string>
  /**
   * Module-scope names the output writes differently — the file's own
   * component, renamed clear of the default export Beast names after the file.
   * Applied to references on the tree, so a string or JSX text that happens to
   * spell the name is left alone.
   */
  renames: Map<string, string>
  /** `component` blocks lifted out of render props, awaiting emission. */
  lifted: string[][]
  /**
   * React names the conversion handles by rewriting every use of them, so
   * losing the import is the point rather than a gap worth reporting.
   */
  unwrappedReact: Set<string>
  /**
   * Module-scope names bound to `createContext(...)`. Octane renders a context
   * as its own provider, so every `Theme.Provider` is written as `Theme`.
   */
  contexts: Set<string>
  /**
   * JSX-returning helpers in scope for the body being converted — `renderValue`
   * — that were lifted into `component` blocks, keyed by their local name.
   * Scoped to the body that declared them: a sibling component calling a prop
   * of the same name must not mount another component's helper.
   */
  helpers: Map<string, LiftedHelper>
  /**
   * The `async` components being converted. Octane has no async components, so
   * an `await` directly in one of their bodies is read with `use()` instead.
   */
  asyncComponents: Set<ts.Node>
  /** The local name Octane's `use` is imported under, once an `await` needs it. */
  useName: string | null
  /** Warnings about anything the output could not carry over faithfully. */
  diagnostics: ConversionDiagnostic[]
}

/** A helper function lifted into a `component` block, and how to mount it. */
export interface LiftedHelper {
  component: string
  /** Its parameter names, in order: the call's arguments become these props. */
  params: string[]
  /** Names it read from the component around it, passed explicitly. */
  captures: string[]
}
