# Blockle Blocks setup

How `@blockle/blocks` is wired into this project: Next.js App Router,
Vanilla Extract, and the Momotaro theme.

For component selection and usage, see the
[component guide](./components/README.md).

## Packages

Installed in [package.json](../package.json):

- `@blockle/blocks`: the component library.
- `@blockle/blocks-theme-momotaro`: the theme passed to `BlocksProvider`.
- `@vanilla-extract/css`: for writing `.css.ts` styles with `vars` tokens.
- `@vanilla-extract/next-plugin` (dev): compiles `.css.ts` files in Next.js.
- `@vanilla-extract/vite-plugin` (dev): compiles `.css.ts` files in Vitest.

Blocks also declares peer dependencies on `@blockle/blocks-core`,
`@blockle/blocks-react`, `@blockle/blocks-react-slot`, and
`@blockle/blocks-reset`; the package manager resolves them.

## Next.js configuration

[next.config.ts](../next.config.ts) wraps the Next.js config with
`createVanillaExtractPlugin`, using the Turbopack integration:

```ts
import { createVanillaExtractPlugin } from '@vanilla-extract/next-plugin';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // existing Next.js options
};

const withVanillaExtract = createVanillaExtractPlugin({
  unstable_turbopack: { mode: 'auto' },
});

export default withVanillaExtract(nextConfig);
```

## Reset and theme provider

The root layout, [src/app/layout.tsx](../src/app/layout.tsx), imports the
Blocks reset and wraps the app in `BlocksProvider`:

```tsx
import '@blockle/blocks/reset';

import { BlocksProvider } from '@blockle/blocks';
import { momotaro } from '@blockle/blocks-theme-momotaro';

<BlocksProvider theme={momotaro} colorMode="light">
  {children}
</BlocksProvider>;
```

The app is light-only: the provider pins `colorMode="light"`, and `<html>`
carries `data-color-mode="light"` so the server-rendered first paint is light
too. See [Providers](./components/providers.md#color-mode).

The layout stays a Server Component. Components that use React state, browser
APIs, or interaction need `"use client"`; see the component guide.

## Tests

Vitest compiles `.css.ts` files through `@vanilla-extract/vite-plugin`
(see [vitest.config.mts](../vitest.config.mts)). Render components inside the
theme with `renderWithTheme` from
[src/test/render.tsx](../src/test/render.tsx), which wraps the UI in
`BlocksProvider` with `colorMode="light"`, as the root layout does.

jsdom has no modal dialogs, so [src/test/setup.ts](../src/test/setup.ts)
stands in for `showModal()` and `close()`. Like a browser, its `showModal()`
moves focus into the dialog. Blocks handles Escape on the `<dialog>`, so a
test's `{Escape}` only closes a `Dialog` or `Drawer` while focus is inside it.

## Verify

```bash
npm run check
```

This runs Biome, the TypeScript check, and the tests.
