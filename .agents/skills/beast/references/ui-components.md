# Compelling UI component index

Use this project-specific reference only in the Compelling repository when editing Beast BTSX that consumes `src/components/ui`. Inspect each component's current source before using it; source code is authoritative for props and behavior.

## Imports and required props

| Component | Import | Required props |
| --- | --- | --- |
| `Brand` | `@/components/ui/brand.btsx` | `imageUrl` |
| `Button` | `@/components/ui/button.btsx` | none |
| `ButtonGroup` | `@/components/ui/button-group.btsx` | none |
| `Callout` | `@/components/ui/callout.btsx` | `title`, `text` |
| `Frame` | `@/components/ui/frame.btsx` | none |
| `Header` | `@/components/ui/header.btsx` | `title` |
| `Input` | `@/components/ui/input.btsx` | none |
| `List` | `@/components/ui/list.btsx` | none |
| `ListItem` | `@/components/ui/list-item.btsx` | none |
| `PrimaryButton` | `@/components/ui/primary-button.btsx` | none |
| `Select` | `@/components/ui/select.btsx` | `items` |
| `Switch` | `@/components/ui/switch.btsx` | none |
| `Tag` | `@/components/ui/tag.btsx` | none |
| `SidebarItem` | `@/components/ui/sidebar/sidebar-item.btsx` | `href`, `icon`, `label`, `value`, `path`, `onNavigate` |

Navigation data is exported as `navGroups` from `@/components/ui/sidebar/navs`. There is no UI barrel export; import components directly from their `.btsx` files.

## Contracts worth checking first

- `Button` is an action control; common props include `variant`, `size`, `icon`, `label`, `onClick`, and accessible labels. Use `size="icon"` only with an accessible name.
- `PrimaryButton` is a discriminated button/link component. Omitted or native `type` renders a button; `type="a"` requires `href`. Its union uses `never` props to prevent mixing button-only and anchor-only contracts.
- `Tag` always renders an anchor. Its nested remove button prevents navigation before calling `onRemove`.
- `ButtonGroup` owns `attached`, `orientation`, `variant`, and group sizing. Do not pass `attached` to a child button or tag.
- `Header` chooses action rendering from `href`, then `onClick`, then a non-interactive fallback. Its details toggle appears only when `toggleFn` exists.
- `Input` sends the next `string` to `onChange`, not an input event.
- `Select` sends a `string` to `onValueChange` and skips disabled items.
- `Switch` sends a `boolean` to `onCheckedChange`; give an unlabeled switch an `aria-label`.
- `ListItem` prioritizes `media` over `imageSrc` and `badge` over `badgeIcon`.
- `SidebarItem` intercepts internal navigation but opens external HTTP links directly.

## Authoring rules

- Inspect only the component files used by the task instead of loading the entire catalog.
- Keep controlled and uncontrolled modes distinct: do not pass both `value` and `defaultValue`, or both `checked` and `defaultChecked`.
- Pass content through indented children. Current components type children as `unknown` and render them explicitly.
- Use `className` for the outer element and the component-specific override for inner controls, such as `inputClassName`, `triggerClassName`, or `contentClassName`.
- Use the declared callback payload: `MouseEvent` for actions, `string` for `Input`/`Select`, and `boolean` for `Switch`.
- Do not invent passthrough props. Preserve accessible names for icon-only buttons, unlabeled switches, and lists.

## Compact example

```btsx
import Button from "@/components/ui/button.btsx"
import Input from "@/components/ui/input.btsx"
import Select from "@/components/ui/select.btsx"
import Switch from "@/components/ui/switch.btsx"

Input(type="search" value={query} onChange={setQuery})
Select(items={plans} value={plan} onValueChange={setPlan})
Switch(label="Enabled only" checked={enabled} onCheckedChange={setEnabled})
Button(label="Apply" variant="primary" onClick={apply})
```
