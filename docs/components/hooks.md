# Hooks

The hooks below are public exports, but most are low-level utilities. Prefer
the corresponding Blocks component when it already provides the behavior you
need. Hooks that use React state, DOM events, or browser APIs must be called
from Client Components.

## Interaction hooks

- **`useToast`** — Trigger non-blocking notifications from a component below
  `ToastProvider`. See [Feedback](./feedback.md) for when to use toast
  messages.
- **`useControlledValue`** — For component authors building a value that can
  be controlled by a parent or managed internally. When using it, follow its
  controlled/uncontrolled callback contract; application code should normally
  use a ready-made form component instead.
- **`useKeyboard`** — Register a keyboard listener while implementing a
  client-side interaction. It accepts the key/type, callback, and an
  `{ enabled }` option and cleans up the document listener. Prefer built-in
  keyboard behavior in `Dialog` or `Popover` rather than duplicating it.
- **`usePreventBodyScroll`** — Lock body scrolling while a blocking overlay
  is open. Use it only for an active modal-like surface; prefer `Dialog` or
  `Drawer` if their built-in behavior meets the need.

## Styling and rendering hooks

- **`useComponentStyleDefaultProps`** — Advanced helper for working with
  component style defaults. Use when building theme-aware component
  integrations, not for ordinary application styling.
- **`useComponentStyles`** — Client-side style helper for custom integrations
  with Blocks component styles. Prefer component props and theme tokens for
  normal UI work.
- **`useIsomorphicLayoutEffect`** — SSR-safe layout-effect helper. This is a
  low-level rendering utility, not a substitute for ordinary effects or a
  component API.

