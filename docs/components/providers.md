# Providers and theme

## `BlocksProvider`

`BlocksProvider` makes a Blocks theme available to components below it. Wrap
the application (or the part of the tree that uses Blocks) once with the
chosen theme.

```tsx
import '@blockle/blocks/reset';

import { BlocksProvider } from '@blockle/blocks';
import { momotaro } from '@blockle/blocks-theme-momotaro';

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
nested provider ignores the prop. `useColorMode()` reads the setting and the
resolved mode; the resolved mode is `light` on the server, so do not render
from it what the first paint must get right.

This app keeps the User's choice in `localStorage` (ADR 0017), and
[`src/app/lib/color-mode.ts`](../../src/app/lib/color-mode.ts) owns it: the
storage key, the fallback to `system` for a missing, invalid or unreadable
value, a store that also follows other tabs, and the inline script.

- The root layout runs that script in `<head>`. It puts the stored choice on
  `<html>` before the first paint; with none, `<html>` has no attribute,
  which Blocks treats as `system`. `<html>` has `suppressHydrationWarning`,
  since the script changes it before React hydrates.
- `ColorModeProvider` passes the stored choice to the outermost
  `BlocksProvider`, also during hydration, so the provider never writes a
  different mode over the script's.
- `ColorModeMenu` in the app header sets it. Its sun and moon icons switch
  with CSS on Blocks' selectors, not `useColorMode`, so the first paint shows
  the right one.

For CSS that has to differ by mode beyond the Color roles, get the selectors
from `colorModeSelectors(mode)` in
[`src/app/lib/color-mode-selectors.ts`](../../src/app/lib/color-mode-selectors.ts):
`set` for a picked mode, and `system` under the media query `query` for
`system` (see `palette.css.ts`).

`renderWithTheme` pins `colorMode="light"`.

For complete installation steps and a full root layout example, see
[Blockle Blocks setup](../blockle-blocks-setup.md).
