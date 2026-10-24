# Blocks improvement proposals

Handoff for the `@blockle/blocks` maintainers. Each proposal stands alone and
can ship independently. All proposals are additive.

## 1. `Textarea`: wrapper atoms lose to the theme

**Problem.** `containerProps` atoms work for `flex`, but the theme's wrapper
styles outrank the `padding` and `backgroundColor` atoms. Passing
`containerProps={{ padding: 0, backgroundColor: 'background-800' }}` has no
visible effect (computed `padding-top` stays `8px`, background stays white),
so a `className` is still needed.

**Repro.**

```tsx
<Textarea containerProps={{ padding: 0, backgroundColor: 'background-800' }} />
```

**Expected.** The wrapper has no padding and the dark background.

**Cause.** Atoms are in the `blockle-atom` cascade layer, which is declared
before `blockle-molecule` and `blockle-organism`, so component theme styles
beat atoms. That is consistent library-wide, but it makes the atom types on
`containerProps` misleading for any property the theme also sets.

**Question.** Should the docs or types say which atoms the theme overrides on
the wrapper, or should the wrapper's theme padding and background be applied in
a way atoms can override?

## 2. `Textarea`: `fill` for equal-height layouts

**Problem.** Equal-height `Textarea grow` pairs still need
`min-block-size: 100%` on the `<textarea>` in custom CSS. The wrapper side
(`flex: 1`) is now an atom.

**Proposal.** A `fill` prop that stretches the wrapper to its parent and makes
the `<textarea>` take 100% of the wrapper's block size.

**Repro.**

```tsx
<Grid gap={3}>
  <GridItem colSpan={[12, 6]}>
    <Textarea grow fill />
  </GridItem>
  <GridItem colSpan={[12, 6]}>
    <Textarea grow fill />
  </GridItem>
</Grid>
```

**Expected.** Typing a long value in one textarea gives both the same
`offsetHeight`, with no custom CSS.

**Question.** Is `fill` worth adding, or is `min-block-size` as a textarea
atom-like prop enough?

## 3. `Textarea`: cap the `<textarea>` itself (opt-in)

`maxBlockSize` caps the wrapper, which scrolls, while the `<textarea>` keeps
growing inside it. An opt-in way to cap the `<textarea>` itself would be a
lower-priority addition.

## 4. `Alert`: intent names differ from `Button`, and there is no `open`

**Problem.** `Alert` takes `intent: 'error' | 'info' | 'success' | 'warning'`
while `Button` takes `intent: 'neutral' | 'primary' | 'secondary' | 'danger' |
'success'`, so the "something went wrong" intent is `error` on one and
`danger` on the other. Our docs also showed an `open` prop on `Alert`, which
the types do not have (fixed in `feedback.md` and `layout.md`).

**Repro.**

```tsx
<Alert intent="danger">Name taken.</Alert> // type error: use "error"
<Alert open={hasError}>Name taken.</Alert> // type error: no `open`
```

**Expected.** One intent vocabulary across components.

**Workaround.** `intent="error"`, and render the `Alert` conditionally.

**Question.** Should `Alert` accept `danger` (or `Button` accept `error`), and
is an `open` prop wanted for symmetry with `Dialog`?

## 5. `Dialog` and `Drawer` content is unreachable in jsdom tests

**Problem.** `Dialog` opens with `HTMLDialogElement.showModal()`, which jsdom
does not implement. `Dialog` returns early, the `<dialog>` stays closed, and
Testing Library cannot find anything inside it by role.

**Repro.** `render(<Dialog open onRequestClose={() => {}}>Hi</Dialog>)` in
Vitest with jsdom, then `screen.getByRole('dialog')` throws.

**Expected.** A documented way to test dialogs.

**Workaround.** `src/test/setup.ts` polyfills `showModal`/`close` by setting
the `open` attribute. Blocks has internal `testUtils`, but they are not
exported.

**Question.** Should Blocks export a test setup helper (or document the
polyfill), or fall back to the `open` attribute when `showModal` is missing?

## 6. App shell: no sidebar layout, no single-side borders

**Problem.** A side navigation next to the main area needs a fixed inline
size and a border on one side only. The size atoms only take `auto`, `full`
and `fit-content`, and the border atoms apply to all four sides.

**Repro.**

```tsx
<Box display="flex">
  <Box asChild inlineSize="16rem" borderInlineEnd="thin"> {/* not atoms */}
    <aside>…</aside>
  </Box>
  <Box asChild flex={1}><main>…</main></Box>
</Box>
```

**Expected.** The sidebar is 16rem wide with a thin border on its end side.

**Workaround.** `app-shell.css.ts` with `inlineSize` and `borderInlineEnd`
from `vars`.

#30 replaced the permanent sidebar with a header whose menu button opens the
navigation in a `Drawer`, so `app-shell.css.ts` is gone and the app no longer
needs this. The per-side border atoms would still help elsewhere.

**Question.** Is a `Sidebar`/`AppShell` layout primitive in scope, or
per-side border atoms (`borderInlineEndWidth`, ...)?

## 7. No field wrapper that ties a label and error to an input

**Problem.** Every text field with an inline error needs the same wiring by
hand: two `useId`s, `Label htmlFor`, `aria-invalid`, `aria-describedby` that
points at an `Alert id`, and a conditional `Alert`. The New Project and Rename
Project forms repeat it line for line. Blocks exports `Label`, `TextInput` and
`Alert`, but nothing that composes them.

**Repro.**

```tsx
<Stack gap={1}>
  <Label htmlFor={inputId}>Project name</Label>
  <TextInput
    id={inputId}
    name="name"
    aria-invalid={error ? true : undefined}
    aria-describedby={error ? errorId : undefined}
  />
</Stack>
{error && <Alert id={errorId} intent="error">{error}</Alert>}
```

**Expected.** Something like
`<Field label="Project name" error={error}><TextInput name="name" /></Field>`
that generates the ids and sets `aria-invalid` and `aria-describedby`.

**Workaround.** The wiring above, copied into each form.

The Todo lane's inline New Ticket title field shows its reason in a local
`FieldError` component (`Text tag="p" fontSize="small" color="danger-600"`),
since an `Alert` is too heavy beside a compact field. The Ticket drawer edits
a `Textarea` description the same way, so a `Field` would also need to wrap
`Textarea`, not only `TextInput`.

**Question.** Is a `Field` (label, description, error) component in scope, and
should its error render as an `Alert` or as smaller inline text?

## 8. `Stack tag="ul"` keeps list markers, and there is no `listStyle` atom

**Problem.** `Stack` and `Inline` offer `tag="ul"`/`"ol"` for semantic lists,
but neither the reset nor the components remove the list markers, and there is
no `listStyle` atom. The reset zeroes `padding`, so the markers hang outside
the list, over whatever is beside it. Breadcrumb navigation also needs a
marker-free ordered list.

**Repro.**

```tsx
<Stack tag="ul" gap={2}>
  <Box asChild padding={3}><li>#4 Fix the header</li></Box>
</Stack>

<Inline tag="ol" gap={2}>
  <li><a href="/projects">Projects</a></li>
  <li aria-current="page">Website</li>
</Inline>
```

**Expected.** A list of cards with no bullets.

**Workaround.** `board.css.ts`, `breadcrumbs.css.ts`, `label-list.css.ts`,
`ticket-comments.css.ts`, `blocker-editor.css.ts` and
`acceptance-criteria-editor.css.ts` each use
`style({ listStyle: 'none' })`, passed as `className` to the list component.

**Question.** Should `Stack`/`Inline` with a list `tag` drop the markers by
default, or should Blocks add a `listStyle` atom (`none`)?

## 9. `Select` has no `size`, unlike `Button`

**Problem.** `Button` takes `size="small"`, but `SelectProps` has only
`variant` (`SelectTheme['variants']` is `{ variant: InputVariant }`, no
`size`). A Status select on a compact Board card renders at full form-field
size next to small text, and there is no prop to shrink it.

**Repro.**

```tsx
<Select aria-label="Status of #4" value="Todo" onChange={...}>
  <option>Todo</option><option>In progress</option><option>Done</option>
</Select>
```

**Expected.** `<Select size="small">` matching `Button size="small"`.

**Workaround.** None; the card uses the default size.

**Question.** Should `Select` (and `TextInput`) get the same `size` variant as
`Button`?

## 10. `Drawer`: fixed width, `className` replaces its classes, and reopening throws

**Problem.** Several gaps showed up building a Ticket drawer in Next.js 16:

- **Width.** `placement="right"` sets a fixed `width: 300px` and there is no
  `size` prop (`Dialog` has `small | medium | large`). A form with two
  selects side by side does not fit.
- **`className`.** `Drawer.js` spreads `...restProps` after
  `className: classnames(drawer, placement, root)`, so a `className` replaces
  the Drawer's own classes instead of adding to them (`Dialog` merges).
  Passing a `ref` would likewise replace its internal `dialogRef`.
- **Reopening.** The open state lives in a layout effect that calls
  `showModal()` and never closes in a cleanup. Next.js 16 with Cache
  Components keeps a route the User left in a hidden `<Activity>`, which runs
  effect cleanups but leaves the DOM. The `<dialog>` stays open (and in the
  top layer) behind the next route, and coming back runs `showModal()` on an
  open dialog: `InvalidStateError: The dialog is already open as a non-modal
  dialog`. The server-rendered `<dialog open>` (`dataOpen`) has the same
  conflict on hydration.
- **Client boundary.** `Drawer.js` has no `'use client'` directive (`Dialog.js`
  has one), so it can only be used from a file that has one.
- No focus restore after closing (`Dialog` uses `useRestoreFocus`).

**Repro.**

```tsx
// In a page that Next.js preserves with <Activity>:
<Drawer open placement="right" onRequestClose={() => router.push('/board')}>
  …
</Drawer>
// Open the page, navigate away, navigate back: InvalidStateError.
```

**Expected.** A `size` prop (or a width token), `className` merged like
`Dialog`'s, and a layout-effect cleanup that calls `close()`, so hiding and
showing the Drawer reopens it cleanly.

**Workaround.** `ticket-drawer.tsx` renders the Drawer only while a layout
effect says it is shown (off on the server, during hydration and while
hidden), so each reveal mounts a fresh `<dialog>`. `ticket-drawer.css.ts`
widens it with a `globalStyle` on `dialog[data-ticket-drawer]` (unlayered, so
it beats the Drawer's layered `width`), with a hard-coded `min(40rem, 100%)`
because there is no size token.

The redesigned drawer (#16) still needs the same width workaround: the
details grid, the title input and the description textarea want about
`40rem`, and there is still no `size` prop.

The header's Project drawer (#30, `app-header/app-header.tsx`) fits the
default 300px, but it has to restore focus itself: its `onRequestClose`
focuses the menu button through a `ref`.

**Question.** Should `Drawer` get `Dialog`'s `size`, `className` merging and
focus restore, and close itself in an effect cleanup?

## 11. No Markdown or prose styles

**Problem.** The reset strips browser styles from every element, so rendered
Markdown (an Agent-written Ticket description) needs each element mapped back
to Blocks by hand. `Text` has no `pre`, `li` or `blockquote` tag and `Heading`
has no `asChild`, so most mappings go through `Box asChild`. There are no
table styles, no single-side border for a blockquote (see 6), and no vertical
rhythm between sibling blocks.

**Repro.**

```tsx
<ReactMarkdown>{'# Plan\n\n- one\n\n> note\n\n| A | B |\n|---|---|\n| 1 | 2 |'}</ReactMarkdown>
// Lists lose their indent, the quote and table have no borders.
```

**Expected.** A `Prose` (or `Markdown`-friendly) wrapper that styles
descendant headings, paragraphs, lists, code, quotes and tables with theme
tokens.

**Workaround.** `src/components/markdown/` maps each element to `Heading`,
`Text` or `Box asChild` with atoms inside a `Stack gap={3}`, plus
`markdown.css.ts` for the blockquote's start border and table cell borders.

**Question.** Is a `Prose` component in scope, or should `Text` accept `pre`,
`li` and `blockquote` as tags so mappings need fewer `Box asChild`s?

## 12. `Switch`: no `switch` role, and `onChange` runs inside a state updater

**Problem.** `Switch` renders `<input type="checkbox">` without
`role="switch"`, so assistive technology and Testing Library see a checkbox
(`getByRole('checkbox', { name: 'Show archived' })`), not a switch. Also,
clicking the track (the wrapper `div`, not the input) calls `toggle()`, which
calls `onChange(newValue)` from inside a `setIsChecked` updater; StrictMode
double-invokes updaters, so a non-idempotent `onChange` (for example
`setOpen((open) => !open)`) can fire twice. `onChange` receives a boolean,
not an event, which differs from every other form control and is not in
`forms.md`.

**Repro.**

```tsx
<Label htmlFor="show-archived">Show archived</Label>
<Switch id="show-archived" checked={show} onChange={setShow} />
// screen.getByRole('switch', { name: 'Show archived' }) -> not found
```

**Expected.** `role="switch"` on the input (with `aria-checked` following
`checked`), and `onChange` called outside the state updater.

**Workaround.** The Board passes the boolean straight to a setter
(`onChange={setShowArchived}`), which is idempotent, and tests query the
`checkbox` role.

**Question.** Should `Switch` set `role="switch"` by default, and should
`onChange` move out of the updater (or take an event, like `Checkbox`)?

## 13. `Drawer` and `Dialog`: a click on an element that unmounts counts as an outside click

**Problem.** `useClickOutside` closes on a `document` click listener whose
check is `!ref.current.contains(event.target)`. When the clicked element is
removed from the DOM by the click's own React handler (a button that swaps
itself for an input, an "Edit" toggle, a removed list row), React flushes the
re-render before the event reaches `document`. The target is then detached,
`contains` is `false`, and `onRequestClose` runs although the click started
inside. In jsdom tests with `userEvent` the same click does not close it, so
tests pass while the browser closes.

**Repro.**

```tsx
const [editing, setEditing] = useState(false);

<Drawer open onRequestClose={close}>
  {editing ? <input /> : <button onClick={() => setEditing(true)}>Edit</button>}
</Drawer>;
// Clicking "Edit" in a browser calls close().
```

**Expected.** Only clicks that started outside the dialog close it, for example
by checking `event.composedPath()` or the `pointerdown`/`mousedown` target
instead of the target at `click` time.

**Workaround.** The ticket drawer's "Edit description" button calls
`event.nativeEvent.stopImmediatePropagation()` in its click handler. In Next
the React root is `document`, so `stopPropagation()` does not stop the Drawer's
listener (same node); `stopImmediatePropagation()` does, because React's
listener is registered first. It is covered by a test that asserts no
`document` click listener sees the click. The comment list's Edit, Remove and
Cancel buttons swap themselves out the same way and use the same workaround
(`keepDrawerOpen`, now in `ticket-drawer/keep-drawer-open.ts`), with the
same kind of test. The redesigned drawer (#16) swaps out many more buttons:
the title (which turns into an input), the description's Save and Cancel,
the label chips' remove buttons, Add label, Archive and the archived
banner's Restore all need it. The header's copy button for the Ticket
number (#34, `copy-ticket-number.tsx`) swaps its text and icon on click and
calls it too.

**Question.** Should `useClickOutside` decide from where the interaction
began, so unmounting the target is safe?

## 14. `Text`: no line-clamp or single-line ellipsis

**Problem.** A compact Ticket card needs its description capped at two lines.
`Text` has no line-clamp atom, and `overflow="hidden"` alone cannot limit it
to a fixed number of lines.

**Repro.**

```tsx
<Text lineClamp={2}>{description}</Text>
// Type error: `lineClamp` is not a Text prop or atom.
```

**Expected.** An opt-in line-clamp prop or atom that truncates text after a
given number of lines.

**Workaround.** A local vanilla-extract class sets `display: -webkit-box`,
`-webkit-box-orient: vertical`, `-webkit-line-clamp: 2`, and `overflow:
hidden`.

**Also no single-line ellipsis.** The header's breadcrumb trail stays on one
line, and the current page's name gives way with an ellipsis. Atoms have
`overflow` and `whiteSpace`, but no `textOverflow`, and no `minInlineSize` to
let a flex item shrink below its content. `breadcrumbs.css.ts` sets
`minInlineSize: 0` on the trail and `minInlineSize: 0`, `overflow: hidden`,
`textOverflow: 'ellipsis'` and `whiteSpace: 'nowrap'` on the current entry.

**Question.** Should `Text` expose a line-clamp atom? And should atoms add
`textOverflow` and `minInlineSize` (or a `truncate` prop on `Text`)?

## 15. `Inline` and `Stack` take no ARIA or other HTML attributes

**Problem.** A Ticket's labels are a list named "Labels". `InlineProps` and
`StackProps` allow only atoms, `className`, `style`, `tag` (and `role` on
`Stack`), so the list cannot get an `aria-label` or `aria-labelledby`.

**Repro.**

```tsx
<Inline tag="ul" gap={1} flexWrap="wrap" aria-label="Labels">
  <li>bug</li>
</Inline>
// Type error: `aria-label` is not an Inline prop.
```

**Expected.** `Inline` and `Stack` accept the HTML attributes of their element,
as `Box` does through `HTMLElementProps`, or at least `aria-*` and `id`.

**Workaround.** `label-list.tsx` uses `Box asChild display="flex"
flexWrap="wrap" gap={1}` around a plain `<ul aria-label="Labels">`.
`ticket-comments.tsx` does the same for its comment list, with
`flexDirection="column"` and `aria-labelledby` pointing at the "Comments"
heading, where a `Stack tag="ul"` would otherwise do.

**Undocumented escape hatch.** TypeScript does not check hyphenated JSX
attributes against a component's props, so `<Stack tag="ul" aria-label="…">`
compiles even though `StackProps` has no `aria-label`, and `Stack` passes it
on to the element at runtime. `project-directory.tsx` and `blocker-editor.tsx`
rely on this; `id` and other plain attributes are still refused. It works by
accident of the types, so a Blocks release could drop it without a type error.

`acceptance-criteria-editor.tsx` does the same for its `Stack tag="ul"` named by
the "Acceptance criteria" heading.

`cycle-history.tsx` ("Archived Cycles") and `cycle-ticket-list.tsx` ("Tickets
in this Cycle") name their `Stack tag="ul"` lists with `aria-label` the same
way.

**Also no `span` tag or `role`.** A Board card's acceptance-criteria count is
an icon plus `2/4`, read as one image named "Acceptance criteria: 2 of 4
checked". `Inline` would lay it out, but its `tag` allows only `div`, `ul`,
`ol` and `nav`, and it takes no `role`; nesting it in `Text` puts a `div` in a
`span`. `ticket-card.tsx` uses `Box asChild display="flex" alignItems="center"
gap={1}` around a plain `<span role="img" aria-label="…">`.

**No event handlers either.** An acceptance criterion's inline "Remove this
criterion?" confirm cancels on Escape. `<Stack onKeyDown={…}>` is a type error
(the prop does reach the element at runtime), so
`acceptance-criteria-editor.tsx` puts the handler on the surrounding `<li>`.

**Question.** Should `Inline` and `Stack` forward HTML attributes, or support
`asChild` like `Box`? If forwarding `aria-*` is intended, can the types say so?

## 16. No badge or tag component

**Problem.** Ticket labels show as small pills, some with a remove button.
Blocks has no `Badge`/`Tag` component, so each pill is assembled from `Box
asChild` (background, `borderRadius="full"`, padding), `Text
fontSize="xsmall"` and a ghost `Button size="small"` with an icon. The
small button makes a removable pill taller than a plain one. The Board
card's "Blocked" marker is a second, non-removable pill with an intent
colour and a leading icon, assembled the same way.

**Repro.**

```tsx
<Badge onRemove={() => remove('bug')} removeLabel="Remove label bug">
  bug
</Badge>
// No such export in @blockle/blocks.
```

**Expected.** A compact pill with theme intents and an optional, accessibly
named remove button sized to the pill.

**Workaround.** `src/components/label-list/label-list.tsx` composes the parts
above; the card's `BlockedMarker` (`src/components/ticket-card/ticket-card.tsx`)
does too, with `warning` shades and an `Icon`.

**Question.** Is a `Badge` (or `Tag`) with an optional remove action in scope
for Blocks?

## 17. `Drawer`: every Escape on the page closes it, and `onRequestClose` has no reason

**Problem.** `Drawer` closes through `useKeyboard('Escape', …)`, a `keydown`
listener on `document`. Any Escape that bubbles there closes the drawer, so an
in-place edit inside it (a title input, a description textarea, an "add
label" field) that wants Escape to mean "cancel this edit" must stop the
event itself. And `onRequestClose()` gets no argument, so the app cannot tell
Escape from an outside click or treat them differently. `Drawer` also does
not take part in `Dialog`'s nesting (`DialogContext.setEnabled`), so a
confirmation `Dialog` opened from inside a drawer would leave the drawer's own
Escape and outside-click listeners on: one Escape closes both.

**Repro.**

```tsx
<Drawer open onRequestClose={close}>
  <input onKeyDown={(event) => event.key === 'Escape' && cancelEdit()} />
</Drawer>;
// Escape in the input cancels the edit and closes the drawer.
```

**Expected.** Escape handled on the dialog (or its `cancel` event) rather
than the document, so content can claim it with `stopPropagation()` or
`preventDefault()` and the drawer skips an Escape already handled;
`onRequestClose(reason: 'escape' | 'outside-click')`; and `Drawer`
disabling itself while a nested `Dialog` is open, as `Dialog` does.

**Workaround.** In #16 every in-place edit's `onKeyDown` stops an Escape with
`claimEscape` (`ticket-drawer/keep-drawer-open.ts`), used by the title, the
description and the label field. As with proposal 13, Next's React root is
`document`, the same node as the Drawer's listener, so `stopPropagation()`
alone is not enough; `nativeEvent.stopImmediatePropagation()` is, because
React's listener is registered first. Tests assert no `document` `keydown`
listener sees the Escape (in jsdom the root is a container, so they cannot
tell the two apart). The "discard changes to the description?" question
uses `window.confirm()` from the drawer's `onRequestClose` handler, not a
nested `Dialog`.

The header's Project drawer (#30) does nest one: `ProjectNav`'s "New Project"
`Dialog`. One Escape in that dialog would close the drawer as well, and
unmount the dialog with it. `AppHeader` works around it: its
`onRequestClose` does nothing while a `dialog[open]` is open inside the
drawer, relying on the drawer's `document` listener running before the
dialog's, because the drawer opened first.

**Question.** Should overlays listen for Escape on themselves, pass a reason
to `onRequestClose`, and should `Drawer` join `Dialog`'s nesting context?

## 18. No unstyled button for click-to-edit text

**Problem.** The drawer's title is a heading that turns into an input when
clicked or on Enter. That needs a real `<button>` inside the `<h2>` that looks
like the heading text, with only a hover background and a focus ring. Every
`Button` variant (`solid`, `outline`, `ghost`) adds padding, a font size and a
height from the theme, so the title would not look like a heading.

**Repro.**

```tsx
<Heading level={2}>
  <Button variant="ghost">{title}</Button>
</Heading>;
// Renders a button-sized, button-font title, not the heading.
```

**Expected.** A `variant="plain"` (or `unstyled`) `Button` that inherits font
and colour, and keeps only the theme's focus ring and a subtle hover.

**Workaround.** A plain `<button>` with `titleButton` in
`ticket-drawer.css.ts` (resets font, border and background, adds the hover
background and `vars.focus.boxShadow`). The edit input matches the heading
through `TextInput`'s `inputClassName` and `titleInput`.

**Second case.** Each acceptance criterion's text opens its edit field on a
click, so it is a button that has to read as body text and wrap across lines.
`acceptance-criteria-editor.tsx` uses `Box asChild` on a plain `<button>` for
the reset (`border="none"`, `backgroundColor="transparent"`,
`wordBreak`) plus a `text` class for what atoms cannot express:

- `cursor: text`. The `cursor` atom has only `auto` and `pointer`.
- `textAlign: start`. The `textAlign` atom has `left` and `right` but no
  logical `start` or `end`.
- The `:hover` background and the `:focus-visible` ring.
- Biome's `noAutofocus` flags `autoFocus` on the plain `<button>`, which
  returns focus to the text after an edit, though not on Blocks' `Button`.

**Faint until hovered.** Each criterion's drag handle is at `opacity: 0.4`
until its row is hovered or focused. The `opacity` atom has only `0` and `1`,
and there is no token for a muted control, so the value is a bare number in
the `handle` class.

**Two focus rings.** The workarounds use `vars.focus.boxShadow`, a cyan glow
(`0 0 1px 2px #7FE3F0` in momotaro). The theme's own controls (`Button`,
`Checkbox`) use `outline: 2px solid primary-300` from its `focusable`
helper, so a criterion's text and its checkbox show different rings side by
side.

**Question.** Is a plain button variant in scope, or should inline editing
be its own component (an `InlineEdit` or `EditableText`)? And which focus
ring should custom controls use: `vars.focus.boxShadow`, or a token for the
outline the theme's components draw?

## 19. `Alert`: always `role="alert"`, and no action slot

**Problem.** The drawer shows a lasting banner, "This Ticket is archived",
with a Restore button in it. `Alert` always renders `role="alert"`, which is
meant for urgent, newly shown messages, not a status that stays while a
Ticket is archived. Its children go into a plain `div` next to the optional
close button, so there is no slot for an action and nothing to place one at
the end of the banner.

**Repro.**

```tsx
<Alert intent="info">
  This Ticket is archived <Button>Restore</Button>
</Alert>;
// role="alert"; Restore sits right after the text.
```

**Expected.** A `role` override (or a `status` variant using `role="status"`)
and an `action` slot placed at the end, like the close button.

**Workaround.** `Alert intent="info"` with an `Inline` of `Text` and an
outline `Button` as its children (`ticket-drawer.tsx`).

**Question.** Should `Alert` take a `role` (or `live`) prop and an `action`
slot?

## 20. No menu or dropdown component

**Problem.** A Ticket's less frequent actions (Archive today, more later)
would fit a "⋯" menu in the drawer's header. Blocks has `Popover`, but no
`Menu`/`DropdownMenu` with menu roles, arrow-key focus and close-on-select,
so the redesign (#16) puts Archive as a quiet button in the drawer's footer
instead.

**Repro.**

```tsx
<Menu trigger={<Button aria-label="More actions">⋯</Button>}>
  <MenuItem onSelect={archive}>Archive</MenuItem>
</Menu>;
// No such export in @blockle/blocks.
```

**Expected.** An accessible menu button built on `Popover`.

**Workaround.** None needed yet; Archive is a footer button.

**Question.** Is a `Menu` component planned?

## 21. `Checkbox` requires `name` even outside a form

**Problem.** The drawer's acceptance criteria are checkboxes that save on
change. They sit in no form, so a `name` means nothing, but `CheckboxProps`
declares `name: string` as required.

**Repro.**

```tsx
<Checkbox checked={criterion.checked} onChange={save}>
  The logo is centred
</Checkbox>;
// Type error: Property 'name' is missing.
```

**Expected.** `name` is optional, as on a native `<input type="checkbox">`.
`TextInput` and `Textarea` have the same rule (forms.md says to give them a
useful `name`), which makes sense inside a form but not for a control that
saves on its own.

**Workaround.** `acceptance-criteria-editor.tsx` passes a made-up
`name={`criterion-${criterion.id}`}`.

**Question.** Is `name` required on purpose? If so, can the docs say why?

## 22. `Checkbox` shrinks beside text that wraps

**Problem.** An acceptance criterion is a row of a drag handle, a `Checkbox`
without a visible label, the criterion's text and a remove button. When the
text wraps, the checkbox box is squeezed narrower than its 24px. The theme
gives the root `inlineSize: 24` and `blockSize: 24` but leaves `flex-shrink`
at its default `1`, so in any flex row the box gives up width to the text.

**Repro.**

```tsx
<Inline gap={1}>
  <Checkbox name="c" aria-label="Long" />
  <Text>{'A criterion long enough to wrap onto a second line. '.repeat(3)}</Text>
</Inline>;
// The box is narrower than it is tall.
```

**Expected.** The box keeps its size: `flex-shrink: 0` on the root (and on
`Radio` and `Switch`, if they share the pattern).

**Workaround.** `acceptance-criteria-editor.css.ts` passes a `checkbox` class
with `flexShrink: 0` through `className`, which reaches the root. Since atoms
cannot be set on `Checkbox`, the `flexShrink` atom is not an option.

**Question.** Should fixed-size form controls not shrink by default?

## 23. `Inline` `alignY` takes `left` and `right`

**Problem.** An acceptance criterion's row first aligned its items to the top,
so a wrapping text kept the checkbox and buttons by its first line. `alignY` is
typed as `keyof AlignItemsMap`, whose keys are `left`, `right`, `center` and
`stretch`, so "top" is `alignY="left"`.

**Repro.**

```tsx
<Inline gap={1} alignY="top">…</Inline>;
// Type error; alignY="left" is what means top.
```

**Expected.** `alignY` takes `top` and `bottom` (`alignX` keeps `left` and
`right`).

**Workaround.** `acceptance-criteria-editor.tsx` used the
`alignItems="flex-start"` atom instead of `alignY`. The row now centres its
items with `alignY="center"`, so no code depends on this today.

**Question.** Can `alignY` get its own map with `top` and `bottom`?

## 24. No live region for a polite announcement

**Problem.** The drawer's copy button for the Ticket number (#34) confirms
"Copied" in place, but its accessible name stays "Copy Ticket number #42",
so screen readers need a separate announcement. Blocks has no live-region or
announcer component. `Alert` is always `role="alert"` and visible (19), and a
toast needs a `ToastProvider` the app does not have. `VisuallyHidden` takes
HTML attributes, so it can carry `role="status"`, but every consumer has to
know to keep it mounted and empty so that later text is announced.

**Repro.**

```tsx
<Button aria-label="Copy Ticket number #42" onClick={copy}>
  {copied ? 'Copied' : '#42'}
</Button>;
// The name never changes, so nothing announces "Copied".
```

**Expected.** A component such as `<LiveRegion politeness="polite">` (or an
`announce()` hook) that stays mounted, is visually hidden and announces
changes to its text.

**Workaround.** `copy-ticket-number.tsx` renders
`<VisuallyHidden role="status">` all the time, empty until a copy succeeds
or fails.

**Question.** Should Blocks ship a live region or an `announce` hook, so
that in-place confirmations are announced the same way everywhere?

## 25. No tabs or tab-link navigation

**Problem.** A Project's views (its Backlog, each Prepared or Active Cycle
and its History) are pages, shown as a row of tabs with the current one
marked. Blocks has no `Tabs` component, and no link variant for a selected
navigation item, so each tab is assembled from `Box asChild` (background,
radius, padding) around an `<li>` holding an `AppLink` with
`aria-current="page"`. The current tab can only be told apart by a
background, since there are no single-side border atoms (6) for an
underline.

**Repro.**

```tsx
<Tabs aria-label="Project views">
  <Tab href="/project/3" current>Backlog</Tab>
  <Tab href="/project/3/cycle/7">Launch the beta</Tab>
</Tabs>
// No such export in @blockle/blocks.
```

**Expected.** A tab-link navigation (a `nav` of links, current one marked
with `aria-current` and a theme style), and possibly an in-page `Tabs` with
`tablist`/`tab`/`tabpanel` roles for content that is not a route.

**Workaround.** `src/components/project-tabs/project-tabs.tsx`: a `<nav
aria-label="Project views">` around `Inline tag="ul"` (with a `listStyle:
none` class, 8), each tab a `Box asChild` `<li>` with `primary-100` behind
the current one.

**Question.** Is a link-based tab navigation in scope for Blocks, and should
it share its look with an in-page `Tabs`?

## Notes (lower priority)

Not needed by the current consumer, recorded for completeness.

- **`Grid columns`:** a `columns` prop (number or responsive array, for
  example `columns={[1, 2, 4]}`, mapping to `repeat(n, minmax(0, 1fr))`) for
  layouts that do not fit 12 columns. Most layouts fit the 12-column grid, so
  this is a niche need. Open question: what should `GridItem colSpan` mean
  when `columns` is not 12?
- **Grid `autoFit`:** a `minColumnSize` or `autoFit` option for responsive card
  grids without media queries.
- **Fixed tracks:** layouts such as "fixed badge column plus flexible columns"
  need a free-form template. Custom CSS is fine for that, no prop is proposed.
