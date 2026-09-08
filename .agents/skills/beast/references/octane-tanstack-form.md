# Forms with `@octanejs/tanstack-form`

Use this binding for every component that owns or coordinates form state, fields, validation, submission, form groups, or field groups. Do not build a competing form store and do not import `@tanstack/react-form`.

A leaf input may remain a controlled, presentational component, but form-aware wrappers must connect it to the binding's field value, metadata, handlers, and accessibility state.

## Choose the smallest API

| Need | API |
| --- | --- |
| Own a form and submission lifecycle | `useForm` |
| Bind an independently composed field | `useField` |
| Coordinate a reusable subset of a form | `useFormGroup` or `useFieldGroup` |
| Build project-standard field/form components | `createFormHook` and `createFormHookContexts` |
| Render only when selected form state changes | `form.Subscribe` or the exported store selectors |

The binding re-exports `@tanstack/form-core` and Octane TanStack Store helpers. Inspect its installed types or current README before using less common APIs.

## Native event semantics

- Text controls update a field from native `onInput`, for example `onInput={(event) => field.handleChange(event.currentTarget.value)}`. Native `change` waits for blur or commit.
- Keep TanStack option names such as `validators.onChange` and listener `onChange`; only the DOM event wiring differs.
- Connect blur to `field.handleBlur` when touched/blur validation matters.
- Prevent the native form submission, then call `form.handleSubmit()`; do not bypass the form's validation and submission lifecycle.

## Component rules

- Put domain defaults, validators, and submit behavior at the form-composition layer. Keep reusable visual controls domain-neutral.
- Derive error, pending, valid, touched, and submit-disabled UI from form or field state instead of duplicating it in local state.
- Associate labels, descriptions, and errors with controls using stable IDs and the appropriate ARIA attributes.
- Render submission state through existing button `pending`, `disabled`, and `aria-busy` contracts.
- Prefer selectors or `form.Subscribe` for narrow reactive updates in large forms.
- Preserve typed `defaultValues`; do not erase field paths or values to `any`.
- Use form/field hook contexts when a design system needs standard `Input`, `Select`, error, or submit components across many forms.
- Keep a presentational input's controlled contract compatible with `field.state.value`, `field.handleChange`, and `field.handleBlur`.

## Verify

Exercise initial values, input updates, blur behavior, sync and async validation when used, failed and successful submission, pending state, reset behavior, and accessible error associations. For SSR work, verify the initial subscribed snapshot and hydration path used by the component.

## Official references

- [`@octanejs/tanstack-form` README](https://github.com/octanejs/octane/tree/main/packages/tanstack-form)
- [Octane bindings status](https://github.com/octanejs/octane/blob/main/docs/bindings-status.md)
