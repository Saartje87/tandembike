# Forms and actions

Use form controls for data entry and `Button` for an action. Use `Link` for
navigation; do not use a button to represent a route change unless the action
semantics are genuinely appropriate.

## `Button`

Use `Button` for an action such as saving, submitting, or opening a dialog.
Use `disabled` when the action cannot currently be performed, and provide a
clear label that describes the action.

```tsx
import { Button } from "@blockle/blocks";

<Button variant="solid" onClick={save} disabled={isSaving}>
  {isSaving ? "Saving..." : "Save"}
</Button>;
```

Use `startSlot` and `endSlot` for icon or adornment content. Use `asChild` when
the underlying semantic element should come from a child, such as an anchor;
do not use it merely to add another wrapper.

## Text and numeric entry

- **`TextInput`** is for a single-line value. Give it a useful `name` (it is
  required) and associate it with a `Label`. It wraps the `<input>` in a
  styled container: `className` goes to the container and `inputClassName`
  to the `<input>`, for example to set the input's font.
- **`Textarea`** is for free-form multi-line text, such as a description.
  Give it a useful `name` and a label. See [Textarea sizing and
  styling](#textarea-sizing-and-styling).
- **`NumericInput`** is for a numeric value. Use it instead of a text field
  when the value is inherently numeric.

## Editable text: `InlineEdit`

Text the User edits in place, such as a title, a name, a description or a
comment, uses `InlineEdit` (`src/components/inline-edit/inline-edit.tsx`),
not a hand-built button-and-form pair. At rest it is the text with a hover
tint; a click or Enter opens the field with Cancel (✗). Enter, or focus
leaving the field for elsewhere in the page, saves: the field closes at once
showing the new text, and a refusal reopens it with the reason (after a blur,
without taking focus back). Switching windows does not save. `onSave`
resolves to that reason, or nothing when saved: map a Server Action's result
with `refusalReason(result, field)` from `src/app/lib/action-result.ts`.

- **Single line** (default): a `TextInput`. Pass `wrap` to put the text in a
  `Heading` and `inputClassName` to match its font.
- **`multiline`**: a `Textarea` with Cancel below it; Enter adds a line,
  Cmd/Ctrl+Enter saves. Pass `renderContent` to render the text, such
  as Markdown (links still work), and `placeholder` for empty text.
- **`readOnly`**: just the wrapped text, such as in an archived Project.
- `onEditingChange` hides an item's other buttons while it is edited. There
  is no unsaved-text guard: leaving the field saves it.

## Textarea sizing and styling

`Textarea` renders a wrapper `Box` around the native `<textarea>`.

- `className` and other native props go to the `<textarea>`.
- `containerProps` (`className`, `style`, other `div` props, and any `Box`
  atom such as `flex`) go to the wrapper. The theme's wrapper `padding` and
  `background` outrank the atoms, so override those with a `className`.
- `grow` makes the textarea grow with its content. It is a behavior prop, not
  a class name: it adds an internal hashed class that sets
  `field-sizing: content`, so you will not see a literal `grow` class in the
  DOM. It needs browser support for `field-sizing`.
- `maxBlockSize` only has an effect together with `grow`, and is applied to
  the wrapper's inline `style`, not to the `<textarea>`. The textarea itself
  keeps growing past the limit; the wrapper stops at `maxBlockSize` and scrolls
  (`overflow: auto` comes from the theme), so the cap works but the scrollbar
  belongs to the wrapper.
- To make side-by-side textareas the same height, put them in a flex column
  parent that stretches, give the wrapper `flex={1}` through `containerProps`,
  and give the `<textarea>` `min-block-size: 100%`.

```tsx
<Textarea
  grow
  maxBlockSize={400}
  className={styles.textarea}
  containerProps={{ flex: 1, className: styles.wrapper }}
/>
```

## Choices

- **`Checkbox`** represents an independent on/off choice. Put the human
  readable label in its children and use `name` for form identification.
  Without children it renders only the box: name it with `aria-label`, and in
  a flex row give it a `className` with `flexShrink: 0`, or it shrinks beside
  text that wraps (T308).
- **`Radio`** is for choosing one value from a group. Give related radios the
  same `name` and distinct `value` values.
- **`Select`** is for choosing one item from a set of options. Provide clear
  option text and use its `variant` when a different presentation is needed.
- **`Switch`** represents a boolean setting that can be turned on or off.
  Supply a meaningful label; do not use it for selecting among multiple
  choices. Its `onChange` receives the new boolean, not an event
  (`onChange={setShowArchived}`), and its accessible role is `checkbox`, not
  `switch`.
- **`Slider`** is for choosing a value across a range, especially when
  adjusting a continuous or stepped quantity. Use `step` when the range has
  meaningful increments and show the current value when it is not otherwise
  clear.

## Labels and accessible names

Use **`Label`** to identify a control. Associate it with the relevant input,
and ensure every interactive control has an accessible name. Placeholder text
is not a substitute for a label. Decorative icons inside controls should not
be the only indication of their purpose.

`Label` accepts only the `cursor` atom. To style it, pass a `className`, or
wrap its content in `Text` or `Box`.

Interactive form controls and event handlers belong in a Next.js Client
Component. Keep server-rendered form content outside the client boundary where
possible.
