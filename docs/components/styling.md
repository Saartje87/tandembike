# Styling: atoms and tokens

Blocks styles components through **atoms** (props that each map to one
pre-generated, token-backed CSS class) and **tokens** (the `vars` object, for
your own vanilla-extract styles).

Project rules for using them (no hard-coded colors or spacing, logical CSS
properties) live in [AGENTS.md](../../AGENTS.md).

## Which component accepts which atoms

| Component         | Atoms                                                                                                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Box`, `Flex`     | All atoms                                                                                                                                                                                                                           |
| `Text`, `Heading` | Text atoms (`color`, `fontFamily`, `fontSize`, `fontStyle`, `fontWeight`, `letterSpacing`, `lineHeight`, `textAlign`, `textDecoration`, `textTransform`, `textWrap`, `whiteSpace`, `wordBreak`, `wordWrap`) plus margin and padding |
| `Stack`, `Inline` | All atoms except `flexDirection` (`gap` is required)                                                                                                                                                                                |
| `Grid`            | All atoms except `flexDirection` (`display` can be overridden)                                                                                                                                                                      |
| `Label`           | `cursor` only                                                                                                                                                                                                                       |

Anything not listed here (for example `backgroundColor` on `Text`) needs a
`Box`, or a `className`. `Box` and `Flex` render a `div`; use `asChild` to
render another element while keeping the atoms:

```tsx
import { Box } from '@blockle/blocks';

<Box
  asChild
  backgroundColor="neutral-100"
  borderRadius={2}
  paddingBlock={2}
  paddingInline={3}
>
  <li>Item</li>
</Box>;
```

Atom classes are appended after your own `className`.

## Responsive atoms

These accept a single value or an array with one value per breakpoint, from
smallest to largest: `mobile`, `tablet` (740px), `desktop` (992px), `wide`
(1200px). Omitted breakpoints inherit the previous value, so `padding={[2, 4]}`
is `2` on mobile and `4` from tablet up. The breakpoints are fixed pixel
values; match them if you write your own media queries.

| Group      | Props                                                                                                                        | Values                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Spacing    | `padding`, `paddingBlock`, `paddingBlockStart`, `paddingBlockEnd`, `paddingInline`, `paddingInlineStart`, `paddingInlineEnd` | space token `0`-`8`                                                                     |
| Spacing    | `margin`, `marginBlock`, `marginBlockStart`, `marginBlockEnd`, `marginInline`, `marginInlineStart`, `marginInlineEnd`        | space token `0`-`8` or `auto`                                                           |
| Gap        | `gap`, `columnGap`, `rowGap`                                                                                                 | space token `0`-`8`                                                                     |
| Display    | `display`                                                                                                                    | `none`, `flex`, `inline-flex`, `block`, `inline`, `inline-block`, `grid`, `inline-grid` |
| Flex       | `flexDirection`                                                                                                              | `row`, `row-reverse`, `column`, `column-reverse`                                        |
| Flex       | `flexWrap`                                                                                                                   | `nowrap`, `wrap`                                                                        |
| Flex       | `flex`, `flexGrow`, `flexShrink`                                                                                             | `flex`: `1`; `flexGrow` and `flexShrink`: `0` or `1`                                    |
| Alignment  | `alignItems`, `alignSelf`, `alignContent`, `placeItems`                                                                      | `stretch`, `center`, `flex-start`, `flex-end`, `baseline`                               |
| Alignment  | `justifyContent`                                                                                                             | `flex-start`, `flex-end`, `center`, `space-between`, `space-around`                     |
| Typography | `fontSize`                                                                                                                   | `xsmall`, `small`, `medium`, `large`, `xlarge`, `display` (fluid, for hero titles)      |
| Typography | `letterSpacing`                                                                                                              | `tight`, `normal`, `wide`, `wider`                                                      |
| Position   | `position`                                                                                                                   | `relative`, `fixed`, `absolute`, `sticky`, `static`                                     |

## Static atoms

These take a single value; they are not responsive.

| Group       | Props                                                                                                 | Values                                                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Color       | `color`, `backgroundColor`, `borderColor`                                                             | `black`, `white`, `currentColor`, `transparent`, or `<palette>-<shade>` such as `primary-500`; or a Mode value, see [Color modes and roles](#color-modes-and-roles) |
| Border      | `borderRadius`                                                                                        | `0`-`4`, `full`                                                                                                                                                     |
| Border      | `borderWidth`                                                                                         | `thin`, `thick`                                                                                                                                                     |
| Border      | `borderStyle`                                                                                         | `solid`, `dashed`, `dotted`, `double`, `none`                                                                                                                       |
| Border      | `border`, `outline`, `appearance`                                                                     | `none`                                                                                                                                                              |
| Shadow      | `boxShadow`                                                                                           | `1`-`5`                                                                                                                                                             |
| Size        | `inlineSize`, `blockSize`, `maxInlineSize`, `maxBlockSize`                                            | `auto`, `full` (100%), `fit-content`                                                                                                                                |
| Size        | `minInlineSize`                                                                                       | `0`                                                                                                                                                                 |
| Overflow    | `overflow`, `overflowBlock`, `overflowInline`                                                         | `hidden`, `scroll`, `visible`, `auto`                                                                                                                               |
| Inset       | `insetBlock`, `insetBlockStart`, `insetBlockEnd`, `insetInline`, `insetInlineStart`, `insetInlineEnd` | `0`                                                                                                                                                                 |
| Typography  | `fontFamily`                                                                                          | `body`, `heading`, `mono`                                                                                                                                           |
| Typography  | `fontWeight`                                                                                          | `light`, `normal`, `medium`, `strong`, `bold`                                                                                                                       |
| Typography  | `lineHeight`                                                                                          | `compact`, `snug`, `normal`, `relaxed` (unitless ratios)                                                                                                            |
| Typography  | `fontStyle`                                                                                           | `normal`, `italic`, `oblique`                                                                                                                                       |
| Typography  | `textAlign`                                                                                           | `center`, `start`, `end`, `justify`                                                                                                                                 |
| Typography  | `textDecoration`                                                                                      | `overline`, `line-through`, `underline`, `none`                                                                                                                     |
| Typography  | `textTransform`                                                                                       | `lowercase`, `uppercase`, `capitalize`                                                                                                                              |
| Typography  | `textWrap`                                                                                            | `balance`, `wrap`                                                                                                                                                   |
| Typography  | `whiteSpace`                                                                                          | `nowrap`, `pre`, `pre-line`, `pre-wrap`                                                                                                                             |
| Typography  | `wordBreak`, `wordWrap`                                                                               | `break-word`                                                                                                                                                        |
| Interaction | `cursor`                                                                                              | `auto`, `pointer`, `text`, `grab`, `grabbing`, `not-allowed`                                                                                                        |
| Interaction | `pointerEvents`, `userSelect`                                                                         | `none`                                                                                                                                                              |
| List        | `listStyle`                                                                                           | `none` (see [Layout](./layout.md#composition-with-aschild))                                                                                                         |
| Other       | `opacity`                                                                                             | `0`, `1`                                                                                                                                                            |
| Other       | `transition`                                                                                          | `slow`, `normal`, `fast`                                                                                                                                            |

Palettes are `primary`, `secondary`, `success`, `warning`, `danger`, `info`,
and `neutral`, each with shades `100`-`900`, plus the fixed `white` and
`black`. There are no `text-*` or `background-*` shades: use a text role on
`Text` and `Heading`, or a surface role in a `.css.ts` file (see
[Color modes and roles](#color-modes-and-roles)). The resolved values (pixels,
hex colors) come from the active theme.

## Tokens with `vars`

`vars` exposes the same token keys as CSS variables for your own
vanilla-extract styles:

| Token group                     | Keys                                                                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vars.space`                    | `0`-`8`                                                                                                                                                                                                               |
| `vars.color`                    | `black`, `white`, and `<palette>-<shade>` (for example `"primary-500"`)                                                                                                                                               |
| `vars.borderRadius`             | `0`-`4`, `full`                                                                                                                                                                                                       |
| `vars.borderWidth`              | `thin`, `thick`                                                                                                                                                                                                       |
| `vars.fontFamily`               | `body`, `heading`, `mono`                                                                                                                                                                                             |
| `vars.fontSize`                 | `xsmall`, `small`, `medium`, `large`, `xlarge`, `display`                                                                                                                                                             |
| `vars.lineHeight`               | `compact`, `snug`, `normal`, `relaxed`                                                                                                                                                                                |
| `vars.letterSpacing`            | `tight`, `normal`, `wide`, `wider`                                                                                                                                                                                    |
| `vars.fontWeight`               | `light`, `normal`, `medium`, `strong`, `bold`                                                                                                                                                                         |
| `vars.transition`               | `slow`, `normal`, `fast`                                                                                                                                                                                              |
| `vars.colorRole.<group>.<role>` | the Color roles, such as `vars.colorRole.text.muted`, `vars.colorRole.surface.sunken`, `vars.colorRole.focusRing.boxShadow` and `vars.colorRole.shadow[1]`-`[5]`; see [Color modes and roles](#color-modes-and-roles) |

## Color modes and roles

Blocks themes have a value for each Color mode, `light` and `dark`. The app
follows the OS or the User's choice (see
[Providers](./providers.md#color-mode)), so every colour has to work in both:
use a Color role or a Mode value, never a bare Palette shade. A colour that
stays the same in both modes is a deliberate exception with a comment, such
as the app header's `primary-600` with `white`.

**Color roles** are purpose-named colors with a value per mode. Prefer a role
over a Palette shade when one fits:

| Group                                                                     | Roles                                                               |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `text`                                                                    | `default`, `muted`, `disabled`, `inverse`                           |
| `surface`                                                                 | `default`, `raised`, `sunken`, `inverse`                            |
| `border`                                                                  | `default`, `strong`                                                 |
| `focusRing`                                                               | `color`, `boxShadow`                                                |
| `overlay`                                                                 | `default`                                                           |
| `shadow`                                                                  | `1`-`5`                                                             |
| `primary`, `secondary`, `neutral`, `danger`, `success`, `info`, `warning` | `solid`, `solidHover`, `subtle`, `contrast`, `foreground`, `border` |

On `Text` and `Heading`, `color` takes a text role directly; without `color`
they use `text.default`:

```tsx
<Text tag="p" fontSize="small" color="muted">
  No Tickets yet.
</Text>;
```

The `color`, `backgroundColor` and `borderColor` atoms take Palette values,
not roles (`Icon` included). In a `.css.ts` file, read a role as
`vars.colorRole.<group>.<role>`:

```ts
export const field = style({
  ':focus-visible': {
    boxShadow: vars.colorRole.focusRing.boxShadow,
  },
});
```

On the atoms, use a **Mode value** instead, one Palette shade per mode, such
as `color={{ light: "neutral-900", dark: "neutral-100" }}`. The ones this app
uses copy a role's values and live in
[`src/app/lib/mode-colors.ts`](../../src/app/lib/mode-colors.ts); reuse them:

```tsx
import { modeColors } from '../../app/lib/mode-colors';

<Box backgroundColor={modeColors.sunken} borderRadius={2} padding={3} />;
<Icon name="check-circle" size="small" color={modeColors.textMuted} />;
```

The Project and Epic palette (`src/components/palette/palette.css.ts`) keeps
its own light and dark shades, since Blocks has no decorative palette
(T317).

## Cascade layers

Blocks puts its CSS in cascade layers, lowest first: `blockle-reset`,
`blockle-molecule` (component defaults), `blockle-theme` (the theme's
component styles), `blockle-atom` (atom props), `blockle-organism`. Your own
unlayered CSS, such as a `className` from a `.css.ts` file, beats all of them,
so a single class overrides a component's theme without a doubled `&&`
selector. An atom prop beats the theme too. In short: component defaults <
theme < atom props < app CSS.

## Atoms versus custom styles

Use atoms for token-based layout and simple visual styling. Atoms cannot
express arbitrary values, pseudo-classes (`:focus`, `:hover`), grid templates,
`letter-spacing`, `overflow-wrap`, or selectors for descendants. For those,
write a vanilla-extract `style()` and pass it as `className`, using `vars` for
values:

```ts
import { vars } from '@blockle/blocks';
import { style } from '@vanilla-extract/css';

export const editor = style({
  ':focus-within': {
    outline: `${vars.borderWidth.thick} solid ${vars.color['primary-500']}`,
  },
});
```

Components that wrap a `Box` internally do not always expose its atoms. See
the `Textarea` wrapper in [Forms](./forms.md#textarea-sizing-and-styling).
