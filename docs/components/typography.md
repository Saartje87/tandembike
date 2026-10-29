# Typography

## `Heading`

Use `Heading` for headings in the document outline. Set `level` to match the
content hierarchy, not the visual size you want; style should not skip or
misrepresent heading levels.

```tsx
import { Heading } from '@blockle/blocks';

<Heading level={2}>Account settings</Heading>;
```

## `Text`

Use `Text` for body and supporting copy. Set `tag` to the appropriate
semantic element, such as `p` for a paragraph; use its text and spacing atoms
for presentation.

```tsx
import { Text } from '@blockle/blocks';

<Text tag="p" paddingBlockEnd={2}>
  Update the details associated with your account.
</Text>;
```

`Text` and `Heading` use the `text.default` role when they have no `color`.
For supporting copy, pass a text role: `color="muted"` (or `disabled`,
`inverse`). `color` also takes a Palette shade such as `neutral-800`; see
[Color modes and roles](./styling.md#color-modes-and-roles).

```tsx
<Text tag="p" fontSize="small" color="muted">
  Last edited 3 days ago
</Text>;
```

`Text` supports `asChild` when another component must supply the rendered
element. Keep the resulting HTML semantics meaningful.

To cut overflowing text short with an ellipsis, pass `truncate` (one line) or
`lineClamp` (`1`-`5` lines) instead of writing the CSS:

```tsx
<Text truncate>{ticket.title}</Text>;
<Text lineClamp={2}>{ticket.description}</Text>;
```

`truncate` makes the `Text` a block, so in a flex row the item holding it may
also need `minInlineSize={0}` to shrink.

`Heading` and `Text` accept the text atoms plus margin and padding, but not
`backgroundColor`, borders, or layout atoms; see
[Styling](./styling.md#which-component-accepts-which-atoms). `Text` renders
only `cite`, `code`, `del`, `em`, `ins`, `kbd`, `label`, `mark`, `p`, `q`, `s`,
`small`, `span`, `strong`, `sub`, or `sup`; for other elements, use
`Box asChild`:

```tsx
<Text tag="code" fontFamily="mono" whiteSpace="pre-wrap">
  {value}
</Text>;
```
