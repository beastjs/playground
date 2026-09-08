/**
 * Which module a converted import should point at.
 *
 * Two registries live here. `OCTANE_BINDINGS` maps an upstream npm package to
 * the `@octanejs/*` package that ports it, and the export sets record which
 * React symbols Octane's own runtime actually provides. Both are transcribed
 * from the sources below rather than guessed, so an import is only rewritten
 * when a real binding exists for it.
 *
 * Sources, checked 2026-09-08:
 *   https://github.com/octanejs/octane/blob/main/docs/bindings-status.md
 *   https://github.com/octanejs/octane/blob/main/docs/packages.md
 *   the installed `octane` package's own `.d.ts` exports
 */

/**
 * Upstream package -> the `@octanejs/*` binding that ports it, from the
 * "Ports" column of `docs/bindings-status.md` (108 bindings; `@octanejs/devtools`,
 * `@octanejs/email-cli`, and `@octanejs/shadcn` are omitted because their
 * upstream is Octane itself, a duplicate, or a CLI rather than an import).
 */
export const OCTANE_BINDINGS: Readonly<Record<string, string>> = {
  "@apollo/client":                    "@octanejs/apollo-client",
  "@base-ui/react":                    "@octanejs/base-ui",
  "@base-ui/utils":                    "@octanejs/base-ui-utils",
  "@dnd-kit/react":                    "@octanejs/dnd-kit",
  "@floating-ui/react":                "@octanejs/floating-ui",
  "@formisch/react":                   "@octanejs/formisch",
  "@formkit/auto-animate":             "@octanejs/auto-animate",
  "@gsap/react":                       "@octanejs/gsap",
  "@inertiajs/react":                  "@octanejs/inertia",
  "@lexical/react":                    "@octanejs/lexical",
  "@livestore/react":                  "@octanejs/livestore",
  "@mantine/hooks":                    "@octanejs/mantine-hooks",
  "@mdx-js/mdx":                       "@octanejs/mdx",
  "@monaco-editor/react":              "@octanejs/monaco-editor",
  "@opentui/react":                    "@octanejs/opentui",
  "@phosphor-icons/react":             "@octanejs/phosphor-icons",
  "@portabletext/react":               "@octanejs/portabletext",
  "@rainbow-me/rainbowkit":            "@octanejs/rainbowkit",
  "@react-rxjs/core":                  "@octanejs/rxjs",
  "@react-rxjs/utils":                 "@octanejs/rxjs",
  "@react-spring/web":                 "@octanejs/spring",
  "@react-three/drei":                 "@octanejs/drei",
  "@react-three/fiber":                "@octanejs/three",
  "@reduxjs/toolkit":                  "@octanejs/redux-toolkit",
  "@sanity/icons":                     "@octanejs/sanity-icons",
  "@sanity/logos":                     "@octanejs/sanity-logos",
  "@sanity/react-loader":              "@octanejs/sanity-loader",
  "@solana/react":                     "@octanejs/solana-kit",
  "@stylexjs/stylex":                  "@octanejs/stylex",
  "@tanstack/ai-react":                "@octanejs/tanstack-ai",
  "@tanstack/db":                      "@octanejs/tanstack-db",
  "@tanstack/react-devtools":          "@octanejs/tanstack-devtools",
  "@tanstack/react-form":              "@octanejs/tanstack-form",
  "@tanstack/react-hotkeys":           "@octanejs/tanstack-hotkeys",
  "@tanstack/react-pacer":             "@octanejs/tanstack-pacer",
  "@tanstack/react-query":             "@octanejs/tanstack-query",
  "@tanstack/react-router":            "@octanejs/tanstack-router",
  "@tanstack/react-router-ssr-query":  "@octanejs/tanstack-router-ssr-query",
  "@tanstack/react-store":             "@octanejs/tanstack-store",
  "@tanstack/react-table":             "@octanejs/tanstack-table",
  "@tanstack/react-virtual":           "@octanejs/tanstack-virtual",
  "@tauri-apps/api":                   "@octanejs/tauri",
  "@testing-library/react":            "@octanejs/testing-library",
  "@tiptap/react":                     "@octanejs/tiptap",
  "@vis.gl/react-mapbox":              "@octanejs/react-map-gl",
  "@visx/visx":                        "@octanejs/visx",
  "@xstate/react":                     "@octanejs/xstate",
  "@xstate/store-react":               "@octanejs/xstate-store",
  "@xyflow/react":                     "@octanejs/xyflow",
  "@zag-js/react":                     "@octanejs/zag",
  "animejs":                           "@octanejs/animejs",
  "better-auth":                       "@octanejs/better-auth",
  "cmdk":                              "@octanejs/cmdk",
  "dexie-react-hooks":                 "@octanejs/dexie",
  "electron":                          "@octanejs/electron",
  "embla-carousel-react":              "@octanejs/embla-carousel",
  "html-react-parser":                 "@octanejs/html-react-parser",
  "ink":                               "@octanejs/ink",
  "input-otp":                         "@octanejs/input-otp",
  "jotai":                             "@octanejs/jotai",
  "lucide-react":                      "@octanejs/lucide",
  "mobx-react-lite":                   "@octanejs/mobx",
  "motion":                            "@octanejs/motion",
  "nuqs":                              "@octanejs/nuqs",
  "radix-ui":                          "@octanejs/radix",
  "react-alien-signals":               "@octanejs/alien-signals",
  "react-aria":                        "@octanejs/aria",
  "react-calendar":                    "@octanejs/calendar",
  "react-colorful":                    "@octanejs/colorful",
  "react-content-loader":              "@octanejs/content-loader",
  "react-day-picker":                  "@octanejs/day-picker",
  "react-draggable":                   "@octanejs/draggable",
  "react-dropzone":                    "@octanejs/dropzone",
  "react-email":                       "@octanejs/email",
  "react-error-boundary":              "@octanejs/react-error-boundary",
  "react-hook-form":                   "@octanejs/hook-form",
  "react-i18next":                     "@octanejs/i18next",
  "react-image-crop":                  "@octanejs/image-crop",
  "react-intersection-observer":       "@octanejs/intersection-observer",
  "react-is":                          "@octanejs/octane-is",
  "react-markdown":                    "@octanejs/markdown",
  "react-pdf":                         "@octanejs/pdf",
  "react-popper":                      "@octanejs/popper",
  "react-redux":                       "@octanejs/redux",
  "react-resizable-panels":            "@octanejs/resizable-panels",
  "react-router":                      "@octanejs/remix-router",
  "react-select":                      "@octanejs/select",
  "react-syntax-highlighter":          "@octanejs/syntax-highlighter",
  "react-textarea-autosize":           "@octanejs/textarea-autosize",
  "react-to-print":                    "@octanejs/to-print",
  "react-transition-group":            "@octanejs/transition-group",
  "react-waypoint":                    "@octanejs/waypoint",
  "react-window":                      "@octanejs/window",
  "recharts":                          "@octanejs/recharts",
  "sonner":                            "@octanejs/sonner",
  "streamdown":                        "@octanejs/streamdown",
  "styled-components":                 "@octanejs/styled-components",
  "swr":                               "@octanejs/swr",
  "thinking-orbs":                     "@octanejs/thinking-orbs",
  "use-stick-to-bottom":               "@octanejs/stick-to-bottom",
  "usehooks-ts":                       "@octanejs/usehooks-ts",
  "valtio":                            "@octanejs/valtio",
  "vaul":                              "@octanejs/vaul",
  "wagmi":                             "@octanejs/wagmi",
  "wouter":                            "@octanejs/wouter",
  "zustand":                           "@octanejs/zustand",
};

/**
 * Names that are not the upstream package of record but that people do import,
 * and that land on the same binding: renamed packages, umbrella packages, and
 * the DOM-flavoured aliases.
 */
export const OCTANE_BINDING_ALIASES: Readonly<Record<string, string>> = {
  "@base-ui-components/react": "@octanejs/base-ui",
  "framer-motion": "@octanejs/motion",
  "react-map-gl": "@octanejs/react-map-gl",
  "react-router-dom": "@octanejs/remix-router"
};

/**
 * Scoped families where every member package collapses onto one binding —
 * `radix-ui` is published both as the umbrella package and as one package per
 * primitive, and `@octanejs/radix` ports the umbrella.
 */
const BINDING_PREFIXES: readonly (readonly [string, string])[] = [
  ["@radix-ui/react-", "@octanejs/radix"]
];

/** React's own modules, which map onto the Octane runtime rather than a binding. */
const REACT_MODULES = new Set(["react", "react-dom", "react-dom/client", "react-dom/server"]);

/**
 * React (and React DOM) exports that Octane's root entry provides. Anything
 * outside this set — `forwardRef`, `Component`, `createRef`, `Profiler`,
 * `cache`, `findDOMNode` — has no Octane equivalent, by design: refs are plain
 * props, there are no class components, and there is no `cache()` wrapper.
 */
export const OCTANE_CORE_EXPORTS: ReadonlySet<string> = new Set([
  // react
  "Activity", "Children", "Fragment", "StrictMode", "Suspense", "ViewTransition",
  "act", "addTransitionType", "cloneElement", "createContext", "createElement",
  "isValidElement", "lazy", "memo", "startTransition", "use", "useActionState",
  "useCallback", "useContext", "useDebugValue", "useDeferredValue", "useEffect",
  "useEffectEvent", "useId", "useImperativeHandle", "useInsertionEffect",
  "useLayoutEffect", "useMemo", "useOptimistic", "useReducer", "useRef",
  "useState", "useSyncExternalStore", "useTransition", "version",
  "unstable_Activity", "unstable_ViewTransition", "unstable_addTransitionType",
  // react-dom
  "createPortal", "flushSync", "preconnect", "prefetchDNS", "preinit",
  "preinitModule", "preload", "preloadModule", "requestFormReset",
  "unstable_batchedUpdates", "useFormState", "useFormStatus",
  // react-dom/client
  "createRoot", "hydrateRoot",
  // Octane's own additions that share the surface
  "ErrorBoundary", "Hydrate", "useLinkedState", "useBatch"
]);

/** `react-dom/server` exports that Octane's `octane/server` entry provides. */
export const OCTANE_SERVER_EXPORTS: ReadonlySet<string> = new Set([
  "renderToString", "renderToStaticMarkup", "renderToPipeableStream", "renderToReadableStream"
]);

/**
 * The React-shaped type names Octane itself ships. `octane` re-exports its
 * `public-types` module wholesale (`export type * from './public-types.js'`),
 * which restates React's type surface — `ComponentProps`, `RefObject`, `FC`,
 * `ChangeEvent`, the `*HTMLAttributes` families — in terms of Octane values and
 * native DOM events. So a React type import has an exact destination, and a
 * converted file never has to reach back into `react` for its types.
 */
export const OCTANE_TYPE_EXPORTS: ReadonlySet<string> = new Set([
  "ActivityProps", "AllHTMLAttributes", "AnchorHTMLAttributes", "AnimationEvent",
  "AnimationEventHandler", "AreaHTMLAttributes", "AriaAttributes", "AriaRole", "Attributes",
  "AudioHTMLAttributes", "BaseHTMLAttributes", "Block", "BlockquoteHTMLAttributes",
  "Booleanish", "ButtonHTMLAttributes", "CSSProperties", "CanvasHTMLAttributes", "ChangeEvent",
  "ChangeEventHandler", "ClassValue", "ClipboardEvent", "ClipboardEventHandler",
  "ColHTMLAttributes", "ColgroupHTMLAttributes", "ComponentBody", "ComponentProps",
  "ComponentPropsWithRef", "ComponentPropsWithoutRef", "ComponentRef", "ComponentType",
  "CompositionEvent", "CompositionEventHandler", "Context", "ContextType", "CrossOrigin",
  "CustomComponentPropsWithRef", "DOMAttributes", "DOMElement", "DataHTMLAttributes",
  "DelHTMLAttributes", "DependencyList", "Destructor", "DetailedHTMLProps",
  "DetailedReactHTMLElement", "DetailsHTMLAttributes", "DialogHTMLAttributes", "Dispatch",
  "DispatchWithoutAction", "DragEvent", "DragEventHandler", "EffectCallback",
  "ElementDescriptor", "ElementRef", "ElementType", "EmbedHTMLAttributes", "EventHandler",
  "ExoticComponent", "FC", "FieldsetHTMLAttributes", "FocusEvent", "FocusEventHandler",
  "ForeignHostContext", "FormEvent", "FormEventHandler", "FormHTMLAttributes", "FormStatus",
  "FunctionComponent", "FunctionComponentElement", "HTMLAttributeAnchorTarget",
  "HTMLAttributeReferrerPolicy", "HTMLAttributes", "HTMLInputTypeAttribute", "HTMLProps",
  "HtmlHTMLAttributes", "IframeHTMLAttributes", "ImgHTMLAttributes", "InputEvent",
  "InputEventHandler", "InputHTMLAttributes", "InsHTMLAttributes", "InvalidEvent",
  "InvalidEventHandler", "JSX", "JSXElementConstructor", "Key", "KeyboardEvent",
  "KeyboardEventHandler", "KeygenHTMLAttributes", "LabelHTMLAttributes", "LazyExoticComponent",
  "LiHTMLAttributes", "LinkHTMLAttributes", "LinkedStateOptions", "LinkedStatePrevious",
  "MapHTMLAttributes", "MemoExoticComponent", "MenuHTMLAttributes", "MetaHTMLAttributes",
  "MeterHTMLAttributes", "MouseEvent", "MouseEventHandler", "MutableRefObject",
  "NamedExoticComponent", "NativeEvent", "ObjectHTMLAttributes", "Octane", "OctaneElement",
  "OctaneNode", "OlHTMLAttributes", "OptgroupHTMLAttributes", "OptionHTMLAttributes",
  "OutputHTMLAttributes", "ParamHTMLAttributes", "PointerEvent", "PointerEventHandler",
  "PortalDescriptor", "ProgressHTMLAttributes", "PropsWithChildren", "PropsWithRef",
  "PropsWithoutRef", "Provider", "ProviderProps", "QuoteHTMLAttributes", "ReactElement",
  "ReactHTMLElement", "ReactNode", "ReactPortal", "ReactSVGElement", "Reducer",
  "ReducerAction", "ReducerState", "ReducerStateWithoutAction", "ReducerWithoutAction", "Ref",
  "RefAttributes", "RefCallback", "RefObject", "Root", "RootContainer", "RootOptions",
  "SVGAttributes", "SVGLineElementAttributes", "SVGProps", "SVGTextElementAttributes", "Scope",
  "ScriptHTMLAttributes", "SelectHTMLAttributes", "SetStateAction", "SlotHTMLAttributes",
  "SlotlessSubSlot", "SourceHTMLAttributes", "StrictModeProps", "StyleHTMLAttributes",
  "SubSlot", "SubSlotOptions", "SuspenseProps", "TableHTMLAttributes", "TdHTMLAttributes",
  "TextareaHTMLAttributes", "ThHTMLAttributes", "TimeHTMLAttributes", "ToggleEvent",
  "ToggleEventHandler", "TouchEvent", "TouchEventHandler", "TrackHTMLAttributes",
  "TransitionEvent", "TransitionEventHandler", "UIEvent", "UIEventHandler",
  "VideoHTMLAttributes", "ViewTransitionInstance", "ViewTransitionProps",
  "WebViewHTMLAttributes", "WheelEvent", "WheelEventHandler"
]);

/**
 * Type names Octane keeps only as migration aliases. `ReactNode` still resolves,
 * but `public-types` marks it legacy in favour of `OctaneNode`, so a conversion
 * renames it rather than carrying the old name forward.
 */
export const OCTANE_TYPE_RENAMES: Readonly<Record<string, string>> = {
  ReactNode: "OctaneNode"
};

/** The Octane name for a React type, or null when Octane has no counterpart. */
export function resolveReactType(name: string): string | null {
  if (!OCTANE_TYPE_EXPORTS.has(name)) return null;
  return OCTANE_TYPE_RENAMES[name] ?? name;
}

/** True for the React modules whose symbols are resolved one at a time. */
export function isReactModule(specifier: string): boolean {
  return REACT_MODULES.has(specifier);
}

/**
 * The Octane module one React symbol comes from, or null when Octane has no
 * equivalent and the import has to stay on React.
 */
export function resolveReactExport(specifier: string, name: string): string | null {
  if (specifier === "react-dom/server") {
    return OCTANE_SERVER_EXPORTS.has(name) ? "octane/server" : null;
  }
  return OCTANE_CORE_EXPORTS.has(name) ? "octane" : null;
}

/**
 * The `@octanejs/*` binding for a package specifier, or null when none exists.
 * A subpath is carried across (`zustand/middleware` ->
 * `@octanejs/zustand/middleware`), since the bindings mirror the entry points
 * of the packages they port.
 */
export function resolveBindingModule(specifier: string): string | null {
  const direct = OCTANE_BINDINGS[specifier] ?? OCTANE_BINDING_ALIASES[specifier];
  if (direct) return direct;

  for (const [prefix, binding] of BINDING_PREFIXES) {
    if (specifier.startsWith(prefix)) return binding;
  }

  // Longest package prefix first, so `@tanstack/react-router-ssr-query` is not
  // matched by `@tanstack/react-router`.
  const candidates = Object.keys(OCTANE_BINDINGS)
    .concat(Object.keys(OCTANE_BINDING_ALIASES))
    .filter((pkg) => specifier.startsWith(`${pkg}/`))
    .sort((left, right) => right.length - left.length);
  const [best] = candidates;
  if (best === undefined) return null;

  const binding = OCTANE_BINDINGS[best] ?? OCTANE_BINDING_ALIASES[best];
  return `${binding}${specifier.slice(best.length)}`;
}
