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

## `Tag`

Use `Tag` for a short label in a pill, such as a Ticket's label or its
Blocked marker. It renders a `span` on one line (it never wraps), in an
`intent` (`neutral` by default, or `primary`, `secondary`, `info`, `success`,
`warning`, `danger`, all subtle tints) and a `size` (`small` by default,
`medium`, `large`). It takes HTML attributes but no atoms.

`startSlot` holds an icon before the text, and `endSlot` an `IconButton`
after it, such as one that removes the Tag. Both are sized to the Tag's line
height:

```tsx
import { IconButton, Tag } from '@blockle/blocks';

<Tag
  endSlot={
    <IconButton
      variant="ghost"
      intent="inherit"
      shape="circle"
      size="small"
      label="Remove label bug"
      onClick={remove}
    >
      <Icon name="x-mark" size="small" />
    </IconButton>
  }
>
  bug
</Tag>;
```

Use `asChild` to make another element, such as an `li` or a link, the Tag;
the slots go around that element's children.

For a colour the intents do not cover (an Epic's colour) or a solid pill,
pass a `className`, or build it from `Box`.
