# Providers and theme

## `BlocksProvider`

`BlocksProvider` makes a Blocks theme available to components below it. Wrap
the application (or the part of the tree that uses Blocks) once with the
chosen theme.

```tsx
import "@blockle/blocks/reset";

import { BlocksProvider } from "@blockle/blocks";
import { momotaro } from "@blockle/blocks-theme-momotaro";

<BlocksProvider theme={momotaro}>{children}</BlocksProvider>;
```

Import `@blockle/blocks/reset` once from the root layout so the design system
starts from its intended baseline styles. The provider itself can remain in a
Next.js Server Component when the chosen theme is a static import.

For complete installation steps and a full root layout example, see
[Blockle Blocks setup](../blockle-blocks-setup.md).

