# Display

## `Divider`

Use `Divider` to visually separate adjacent content. It can also contain text
when the divider itself needs a label. Prefer semantic headings or other
structure for meaningful sections; a divider is not a substitute for document
hierarchy.

## `IconMask` and `createIconMask`

Use `IconMask` when an icon mask is supplied by your theme or design system.
`createIconMask` is the exported helper for creating icon-mask values; use it
when defining or adapting icon assets rather than as a general-purpose
component. It creates a component that maps a typed icon name to an asset URL:

```tsx
import { createIconMask } from '@blockle/blocks';

type IconName = 'search' | 'close';

const Icon = createIconMask((name: IconName) => `/icons/${name}.svg`);

<Icon name="search" />;
```

The helper renders `IconMask` with the URL returned by the function. Keep the
icon asset separate from the presentation, and ensure interactive icons also
have an accessible name (for example with
[`VisuallyHidden`](./accessibility.md)).

The app's [`Icon`](../../src/components/icon/icon.tsx) component uses this
helper with the assets in `public/heroicons/outline`. Pass an `IconName` from
those asset filenames, without the `.svg` extension:

```tsx
import { Icon } from '../../src/components/icon/icon';

<Icon name="ticket" size="medium" />;
```

`Icon` is decorative by default. Give the surrounding control an accessible
name when the icon appears inside an interactive control.
