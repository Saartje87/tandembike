# Providers and theme

## `BlocksProvider`

`BlocksProvider` makes a Blocks theme available to components below it. Wrap
the application (or the part of the tree that uses Blocks) once with the
chosen theme.

```tsx
import "@blockle/blocks/reset";

import { BlocksProvider } from "@blockle/blocks";
import { momotaro } from "@blockle/blocks-theme-momotaro";

<BlocksProvider theme={momotaro} colorMode="light">
  {children}
</BlocksProvider>;
```

Import `@blockle/blocks/reset` once from the root layout so the design system
starts from its intended baseline styles. The provider itself can remain in a
Next.js Server Component when the chosen theme is a static import.

## Color mode

`colorMode` is `light`, `dark` or `system`, the default. Only the outermost
`BlocksProvider` uses it: it writes `data-color-mode` on `<html>`, and a
nested provider ignores the prop. This app is light-only, so the root layout
and `renderWithTheme` pass `colorMode="light"`.

The provider writes the attribute only once it mounts, and a page without
`data-color-mode` follows the OS. So the root layout also sets
`data-color-mode="light"` on `<html>`, or a dark-OS User sees a dark first
paint. `useColorMode()` reads the setting and the resolved mode.

For complete installation steps and a full root layout example, see
[Blockle Blocks setup](../blockle-blocks-setup.md).

