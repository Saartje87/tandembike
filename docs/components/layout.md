# Layout

Use layout primitives to compose content and apply consistent spacing. They
are not semantic content by themselves: choose a meaningful element when the
group represents a list, navigation, or other structured content.

Layout primitives are styled with atoms. See [Styling](./styling.md) for the
atoms each component accepts, the breakpoints, and `vars` tokens.

## Choosing a primitive

- **`Box`** is a general-purpose container for grouping content and applying
  style atoms.
- **`Flex`** is `Box` with `display="flex"`; it accepts the same atoms.
- **`Grid`** is for two-dimensional layouts. Use it when both row and column
  relationships matter.
- **`GridItem`** is a child placed in a `Grid`; use it to control an item's
  placement or to compose the child element with `asChild`.
- **`Inline`** groups items horizontally. Use `gap` for consistent spacing.
- **`Stack`** groups items vertically. Use `gap` rather than individual
  margins for consistent rhythm.

```tsx
import { Alert, Button, Stack } from '@blockle/blocks';

<Stack gap={2}>
  {hasError && <Alert intent="danger">Could not save changes.</Alert>}
  <Button onClick={save}>Save changes</Button>
</Stack>;
```

`Stack` and `Inline` support a semantic `tag`; use it when the children form
something meaningful, such as an ordered list. The same visual arrangement
can have different semantics, so choose the tag based on the content rather
than its appearance.

`Stack` and `Inline` accept every atom except `flexDirection`, so
`backgroundColor`, `padding`, `alignItems="baseline"` and so on work directly.
`gap` is required. Use `alignX` / `alignY` for alignment along each axis.

## Composition with `asChild`

Some primitives, including `Box` and `GridItem`, support `asChild`.
Use it to pass the rendered element through a child component when composition
requires a specific semantic element, such as a `li`, `section`, or `header`.
It differs from wrapping that child in the primitive's default element.

```tsx
import { Box } from '@blockle/blocks';

<Box asChild padding={3}>
  <section aria-labelledby="results-heading">...</section>
</Box>;
```

## Responsive grids

`Grid` is a 12-column grid whose tracks can shrink below their content, so long
unbreakable content does not widen it. It accepts the same atoms as `Stack` and
`Inline`, and merges a custom `className` with its own styles. Set the spacing with `gap`, `columnGap`, or
`rowGap`, and place each child in a `GridItem`. `GridItem` takes a required
`colSpan` (1-12) and an optional `rowSpan` (1-12). Both accept a responsive
array that lists values per breakpoint, from smallest to largest: `mobile`,
`tablet` (740px), `desktop` (992px), and `wide` (1200px). Omitted breakpoints
inherit the previous value.

```tsx
import { Grid, GridItem } from '@blockle/blocks';

<Grid gap={4}>
  <GridItem colSpan={[12, 6]}>
    Stacked on mobile, side by side from tablet
  </GridItem>
  <GridItem colSpan={[12, 6]}>Second column</GridItem>
</Grid>;
```

For layouts the 12-column grid cannot express (custom column templates, for
example `1.5fr repeat(3, 1fr)`), write a `style()` with `display: grid`.
