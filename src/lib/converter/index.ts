/**
 * Converts a .tsx source string into the custom ".btsx" template syntax.
 *
 * The transformation rules were reverse-engineered from example input/output
 * pairs. See converter/README.md for the documented rule set and known
 * limitations.
 *
 * Module map, in the order a conversion reaches them:
 *
 *   convert       entry point; orders the output sections Beast requires
 *   imports       React and npm imports rewritten onto Octane
 *   declarations  `module` members and inline type rendering
 *   components    component detection, `forwardRef`, the file's own template
 *   flow          `setup` and early returns as `if` / `elseif` / `else`
 *   lift          helpers and render props lifted into `component` blocks
 *   scope         free-name analysis and collision-free generated names
 *   jsx           the template emitter: elements, attributes, children
 *   blocks        `each`, `switch`, `try`, `style`
 *   print         node printing with requoting and renames on the tree
 *   ast, text     stateless AST questions and line utilities
 *   diagnostics   the thrown parse error and the warnings a result carries
 */
export { convertTsx, convertTsxToBtsx, type ConversionResult } from './convert'
export { BtsxConversionError, type ConversionDiagnostic, type ConversionDiagnosticCode } from './diagnostics'
