# Blockle Blocks component guide

Practical guidance for choosing and using the public React exports from
`@blockle/blocks`. Examples are based on the package's types, stories, and
tests, and on how this project uses it.

For how Blocks is configured in this project (Vanilla Extract, the theme
provider, and tests), see [Blockle Blocks setup](../blockle-blocks-setup.md).

## Guides

- [Accessibility](./accessibility.md): visually hidden accessible content.
- [Display](./display.md): dividers and icon masks.
- [Feedback](./feedback.md): alerts, loading states, progress, and toast
  notifications.
- [Forms](./forms.md): actions and form controls.
- [Layout](./layout.md): composition primitives and spacing.
- [Styling](./styling.md): atoms, breakpoints, and `vars` tokens.
- [Navigation](./navigation.md): links and router integration.
- [Overlays](./overlays.md): dialogs, drawers, popovers, portals, and tooltips.
- [Providers](./providers.md): theme context and reset styles.
- [Typography](./typography.md): semantic headings and text.
- [Hooks](./hooks.md): public hooks and when to use them.

## Shared guidance

- Import public components from `@blockle/blocks`; avoid internal package
  paths.
- Use semantic elements and accessible names. Blocks components do not replace
  the need to label form controls or describe dialogs.
- Prefer a Blocks component over a low-level hook when it already provides the
  interaction you need.
- Components that use React state, browser APIs, or interactive behavior need
  a Client Component boundary in Next.js. Keep static content and the root
  layout server-rendered where possible.
- `asChild` composes a Blocks component with a child element or component,
  rather than nesting the default element. See [Forms](./forms.md),
  [Layout](./layout.md), and [Navigation](./navigation.md).
