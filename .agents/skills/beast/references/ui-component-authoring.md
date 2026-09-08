# Building reusable Beast UI components

Read this reference when creating a reusable UI component from scratch. Inspect adjacent components and project utilities first, then use the architecture below as the default quality bar. Adapt capabilities to the component; do not force link polymorphism, icons, pending state, or every variant onto components that do not need them.

If the user specifies a design system or React-facing library, also read [octane-bindings.md](octane-bindings.md) before choosing imports or primitives.

Form-related components must use `@octanejs/tanstack-form`; read [octane-tanstack-form.md](octane-tanstack-form.md). Table and data-grid components must use `@octanejs/tanstack-table`; read [octane-tanstack-table.md](octane-tanstack-table.md). Leaf presentation components may remain headless, but they must compose with the binding instead of owning a parallel state system.

## Architecture

1. Define the semantic contract before template markup.
2. Export reusable variant and prop types from `module`.
3. Use a discriminated union when one component intentionally supports different native elements. Use `never` for props that are invalid in the other mode.
4. Reuse `JSX.IntrinsicElements[...]` types for native `style`, `value`, `download`, referrer policy, and ARIA contracts instead of recreating DOM types.
5. Type public children as `OctaneNode`. Internal presentation helpers may accept `unknown` when they only render content.
6. Encode variant maps with `as const satisfies Record<Union, ...>` so every declared variant is covered.
7. Keep styling constants and pure helpers in `module`; keep render-derived state and event handlers in `setup`.
8. Extract small local components for repeated presentation such as spinners or icon/label content.
9. Preserve native semantics, focus behavior, accessibility state, and safe external-link behavior in every branch.
10. Compose project classes through its existing utility, such as `cn`, and use the project's icon component and icon-name type rather than inventing parallel systems.

## Interaction and accessibility invariants

- Default a button-capable component to `type="button"` so it does not submit forms accidentally.
- Treat pending and disabled behavior deliberately. Prevent interactions, expose `aria-disabled`/`aria-busy`, and ensure the visual state matches behavior.
- For anchors that cannot be activated, remove `href`, prevent the click, and choose tab behavior intentionally.
- Add `noopener noreferrer` to `_blank` anchors without discarding user-supplied `rel` tokens.
- Keep icon-only controls accessible through `aria-label` or visible text.
- Mark decorative overlays and spinners `aria-hidden` unless they carry meaningful status text.
- Keep native-element-only props on the correct union branch.
- Pass through IDs, titles, tab indices, styles, relevant form attributes, and relevant ARIA attributes when they are part of the public contract.
- Honor reduced-motion preferences for transitions and animation.

## Canonical reference implementation

Use this `PrimaryButton` as the reference shape for a polished, typed, polymorphic control:

```btsx
import { cn } from "@/lib/utils"
import Icon from "@/lib/icons/index.btsx"
import type { IconName } from "@/lib/icons/types"
import type { JSX } from "octane/jsx-runtime"
import type { OctaneNode } from "octane"

module
  export type PrimaryButtonSize = "sm" | "lg"
  export type PrimaryButtonTone = "light" | "dark"
  export type PrimaryButtonNativeType = "button" | "submit" | "reset"
  export type PrimaryButtonType = PrimaryButtonNativeType | "a"
  export type PrimaryButtonTarget = "_blank" | "_self" | "_parent" | "_top"
  export type PrimaryButtonIconPosition = "left" | "right"

  interface PrimaryButtonBaseProps {
    size?: PrimaryButtonSize
    tone?: PrimaryButtonTone
    disabled?: boolean
    pending?: boolean
    pendingLabel?: string
    label?: string | number
    icon?: IconName
    iconPosition?: PrimaryButtonIconPosition
    className?: string
    id?: string
    title?: string
    tabIndex?: number
    onClick?: (event: MouseEvent) => void
    "aria-label"?: string
    "aria-describedby"?: string
    children?: OctaneNode
  }

  export interface PrimaryButtonButtonProps extends PrimaryButtonBaseProps {
    type?: PrimaryButtonNativeType
    href?: never
    target?: never
    rel?: never
    download?: never
    referrerPolicy?: never
    form?: string
    name?: string
    value?: JSX.IntrinsicElements["button"]["value"]
    style?: JSX.IntrinsicElements["button"]["style"]
    "aria-pressed"?: boolean
    "aria-current"?: never
  }

  export interface PrimaryButtonLinkProps extends PrimaryButtonBaseProps {
    type: "a"
    href: string
    target?: PrimaryButtonTarget
    rel?: string
    download?: JSX.IntrinsicElements["a"]["download"]
    referrerPolicy?: JSX.IntrinsicElements["a"]["referrerPolicy"]
    form?: never
    name?: never
    value?: never
    style?: JSX.IntrinsicElements["a"]["style"]
    "aria-pressed"?: never
    "aria-current"?: JSX.IntrinsicElements["a"]["aria-current"]
  }

  export type PrimaryButtonProps = PrimaryButtonButtonProps | PrimaryButtonLinkProps

  interface ContentProps {
    size: PrimaryButtonSize
    tone: PrimaryButtonTone
    label?: string | number
    icon?: IconName
    iconPosition: PrimaryButtonIconPosition
    pending: boolean
    children?: unknown
  }

  const PRIMARY_BUTTON_SIZE_CLASSES = {
    sm: "h-[38px] rounded-lg px-5",
    lg: "h-[42px] rounded-xl px-6",
  } as const satisfies Record<PrimaryButtonSize, string>

  const PRIMARY_BUTTON_ICON_SIZES = {
    sm: 14,
    lg: 16,
  } as const satisfies Record<PrimaryButtonSize, number>

  const PRIMARY_BUTTON_SPINNER_CLASSES = {
    sm: "size-3.5",
    lg: "size-4",
  } as const satisfies Record<PrimaryButtonSize, string>

  const PRIMARY_BUTTON_BASE_CLASS = "group relative isolate inline-flex min-w-0 shrink-0 touch-manipulation select-none appearance-none items-center justify-center overflow-hidden border-0 align-middle font-[Inter,system-ui,sans-serif] text-sm font-semibold leading-5 tracking-[-0.28px] transition-[filter,box-shadow] duration-200 ease-out focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 motion-reduce:transition-none"
  const PRIMARY_BUTTON_CONTENT_CLASS = "relative z-10 inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap transition-[transform,opacity] duration-200 ease-out group-active:scale-[0.96] group-active:opacity-95 group-disabled:scale-100 group-disabled:opacity-100 group-aria-disabled:scale-100 group-aria-disabled:opacity-100 motion-reduce:transform-none motion-reduce:transition-none"
  const PRIMARY_BUTTON_LIGHT_OVERLAY_CLASS = "pointer-events-none absolute inset-0 rounded-[inherit] bg-white/30 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-disabled:opacity-0 group-aria-disabled:opacity-0 motion-reduce:transition-none"
  const PRIMARY_BUTTON_SPINNER_CLASS = "shrink-0 animate-spin rounded-full border-[1.5px] border-current border-r-transparent motion-reduce:animate-none"

  const PRIMARY_BUTTON_TONE_CLASSES = {
    light: "bg-[linear-gradient(in_oklab_180deg,oklab(92.2%_0_0)_0%,oklab(91.3%_0_0)_100%)] text-[#121212] shadow-[inset_0_1px_0_#FFFFFF54,0_3px_4px_-1px_#00000026,0_0_0_1px_#D4D4D4]",
    dark: "bg-[linear-gradient(in_oklab_180deg,oklab(31.7%_0_0)_0%,oklab(25.2%_0_0)_100%)] text-[#FCFCFC] shadow-[inset_0_0.5px_1px_#FFFFFF26,inset_0_-1px_1.2px_0.35px_#121212,0_2px_4px_-1px_#0D0D0D80,0_0_0_1px_#333333] hover:brightness-110 disabled:hover:brightness-100 aria-disabled:hover:brightness-100",
  } as const satisfies Record<PrimaryButtonTone, string>

  const getSafeAnchorRel = (target: PrimaryButtonTarget | undefined, rel: string | undefined) => {
    if (target !== "_blank") return rel
    const tokens = (rel ?? "").split(/\s+/).filter(Boolean)
    return Array.from(new Set([...tokens, "noopener", "noreferrer"])).join(" ")
  }

component Spinner
  props { size }: Pick<ContentProps, "size">
  span(className={cn(PRIMARY_BUTTON_SPINNER_CLASS, PRIMARY_BUTTON_SPINNER_CLASSES[size])} aria-hidden={true})

component Content
  props { size, tone, label, icon, iconPosition, pending, children }: ContentProps
  if tone === "light"
    span(className={PRIMARY_BUTTON_LIGHT_OVERLAY_CLASS} aria-hidden={true})
  span(className={PRIMARY_BUTTON_CONTENT_CLASS})
    if iconPosition === "left"
      if pending
        Spinner(size={size})
      elseif icon
        Icon(name={icon} size={PRIMARY_BUTTON_ICON_SIZES[size]} className="m-0 shrink-0")
    if label !== undefined
      span(className="truncate") #{label}
    | #{children}
    if iconPosition === "right"
      if pending
        Spinner(size={size})
      elseif icon
        Icon(name={icon} size={PRIMARY_BUTTON_ICON_SIZES[size]} className="m-0 shrink-0")

props { size = "sm", tone = "light", type = "button", href, target, rel, download, referrerPolicy, disabled = false, pending = false, pendingLabel, label, icon, iconPosition = "left", className, id, title, tabIndex, form, name, value, style, onClick, "aria-label": ariaLabel, "aria-describedby": ariaDescribedBy, "aria-pressed": ariaPressed, "aria-current": ariaCurrent, children }: PrimaryButtonProps

setup
  const isInteractionDisabled = disabled || pending
  const resolvedLabel = pending && pendingLabel !== undefined ? pendingLabel : label
  const buttonClassName = cn(PRIMARY_BUTTON_BASE_CLASS, PRIMARY_BUTTON_TONE_CLASSES[tone], PRIMARY_BUTTON_SIZE_CLASSES[size], pending ? "cursor-wait aria-disabled:cursor-wait" : "cursor-pointer", className)
  const anchorRel = getSafeAnchorRel(target, rel)
  const handleClick = (event: MouseEvent) => {
    if (isInteractionDisabled) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onClick?.(event)
  }

if type === "a"
  a(id={id} title={title} href={isInteractionDisabled ? undefined : href} target={target} rel={anchorRel} download={download} referrerPolicy={referrerPolicy} tabIndex={isInteractionDisabled ? -1 : tabIndex} className={buttonClassName} style={style} onClick={handleClick} aria-label={ariaLabel} aria-describedby={ariaDescribedBy} aria-current={ariaCurrent} aria-disabled={isInteractionDisabled || undefined} aria-busy={pending || undefined})
    Content(size={size} tone={tone} label={resolvedLabel} icon={icon} iconPosition={iconPosition} pending={pending})
      | #{children}
else
  button(id={id} title={title} type={type} disabled={disabled} form={form} name={name} value={value} tabIndex={tabIndex} className={buttonClassName} style={style} onClick={handleClick} aria-label={ariaLabel} aria-describedby={ariaDescribedBy} aria-pressed={ariaPressed} aria-disabled={pending || undefined} aria-busy={pending || undefined})
    Content(size={size} tone={tone} label={resolvedLabel} icon={icon} iconPosition={iconPosition} pending={pending})
      | #{children}
```

## Adaptation rules

- Preserve the discriminated-union pattern only when a component intentionally renders more than one native semantic element.
- Remove unsupported props instead of advertising passthrough behavior the template does not implement.
- Prefer project tokens and existing variants over copying the example's visual classes literally.
- Use the project's loading/status language and accessibility conventions.
- Keep pure helpers testable and keep template branches small enough that semantic differences remain obvious.
- Verify every branch with the installed Beast/Octane compiler, TSRX-aware typecheck, and the relevant production build.
