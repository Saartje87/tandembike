# Overlays

Overlays place content above the current page. Use them only when the
interaction benefits from a floating or blocking surface; prefer inline
content for ordinary information.

## Choosing an overlay

- **`Dialog`** is for focused, modal content that requires attention or a
  decision. Control it with `open` and `onRequestClose`.
- **`Drawer`** is for a temporary panel-style surface. Control it with
  `open` and `onRequestClose`; `placement` picks the side (default `left`) and
  `size` (`small`, `medium`, `large`) its width. See [Drawer caveats](#drawer-caveats).
- **`Menu`** is for a list of actions or one choice among a few, opened from a
  button. See [Menu](#menu).
- **`Popover`** is for contextual content anchored to a trigger or other
  element. It is controlled and requires `anchorElement`, `open`, and
  `onRequestClose`; it closes on Escape and outside click.
- **`Tooltip`** is for a short description associated with a trigger. Pass
  `content` and wrap the trigger; do not use it as a standalone content
  container.
- **`Portal`** renders overlay content outside its ordinary DOM subtree. Use
  it when an overlay needs to escape ancestor layout or stacking contexts;
  it does not by itself provide dialog or popover behavior.

## Dialog example

`size` (`small` 400px, `medium` 600px, `large` 800px; each at most 90% of the
window) sets a `Dialog`'s width; the theme has no height size, so set a height
with a `className`.

Give dialogs an accessible name and, when useful, a description. Connect
visible title and body elements with `aria-labelledby` and `aria-describedby`.
The component handles Escape dismissal and restores focus after closing.

```tsx
'use client';

import { useState } from 'react';
import { Button, Dialog, Heading, Text } from '@blockle/blocks';

export function DeleteConfirmation() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Delete item</Button>
      <Dialog
        open={open}
        onRequestClose={() => setOpen(false)}
        aria-labelledby="delete-title"
        aria-describedby="delete-description"
      >
        <Heading id="delete-title" level={2}>
          Delete this item?
        </Heading>
        <Text id="delete-description" tag="p">
          This action cannot be undone.
        </Text>
        <Button onClick={() => setOpen(false)}>Cancel</Button>
      </Dialog>
    </>
  );
}
```

## Client-side behavior

Interactive overlays use browser events and DOM measurements. In Next.js,
place them behind a Client Component boundary. For dialogs and drawers, wire
`onRequestClose` to the state that controls `open`; do not leave a dismiss
request unhandled. `onRequestClose` gets the reason, `'escape'` or
`'outside-click'`, for an overlay that should close on only one of them.

For a popover, attach a ref to the trigger and pass that ref as
`anchorElement`. Set `placement` to choose its side and the edge to line up
with (`bottom`, `bottom-start`, `top-end`, …; default `top`). It flips to the
other side when there is no room and shifts to stay on screen. An open
popover keeps its position as the window scrolls or resizes. `sticky` has no
effect and `position` is deprecated, on `Popover` and on `Tooltip`: use
`placement`. `limitHeight` caps its height to the room on its side, so a tall
popover stops at the screen edge; give it `overflow: auto` to scroll.

```tsx
'use client';

import { useRef, useState } from 'react';
import { Popover } from '@blockle/blocks';

export function HelpPopover() {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button ref={anchorRef} onClick={() => setOpen((value) => !value)}>
        Help
      </button>
      <Popover
        anchorElement={anchorRef}
        open={open}
        placement="bottom-start"
        onRequestClose={() => setOpen(false)}
      >
        Helpful context goes here.
      </Popover>
    </>
  );
}
```

jsdom has no Popover API: Blocks then only logs a warning and never opens the
popover, so its content stays hidden. A component test that opens one calls
`showOpenPopovers()` from `src/test/popover.ts` first, which stubs the API and
shows the open popover so Testing Library sees it (T299). In a file with drag
tests, call it inside the `describe` that opens the popover: dnd-kit drags
differently once the Popover API exists. Blocks' `Popover` renders a plain
`div`; pass `role="dialog"` and an `aria-label` when it holds controls.

Keep focus, accessible names, and dismissal behavior in mind when choosing an
overlay. Do not use a tooltip for essential information or a modal dialog for
content that can be read inline.

## Drawer caveats

Checked against `@blockle/blocks-react` 3.3.0:

- The theme sizes it 300px wide (or high), at most 100%. Its `size` prop
  (`medium` 480px, `large` 640px) sets another; no `className` is needed.
- A server-rendered open drawer hydrates without a mismatch warning, so it
  needs no `suppressHydrationWarning`.
- In a route Next.js preserves in a hidden `<Activity>`, it closes while
  hidden and opens as modal again when shown. It hydrates a server-rendered
  open drawer without an error.
- Each new `Drawer` plays its slide-in again. To swap what it shows, such as
  content streaming in or another item, keep one `Drawer` mounted and put the
  `Suspense` boundary inside it, as `TicketDrawerShell` does (T333).
- After closing, it puts focus back on the element that had it when it
  opened.
- It handles Escape on the `<dialog>` itself, so only a key pressed inside it
  closes it. An in-place edit inside it that cancels on Escape calls
  `event.preventDefault()` in its `onKeyDown` to keep the drawer open (see
  `claimEscape` in `claim-escape/claim-escape.ts`). Only the `Dialog` or
  `Drawer` opened last handles Escape and outside clicks, so a sibling
  `Dialog` shown over the drawer, such as `ConversationDialog`, needs no guard
  in the drawer: a click inside it leaves the drawer open, and a click outside
  both closes the topmost.

## Menu

Checked against `@blockle/blocks-react` 3.3.0. A `Menu` is a button that opens
a list of items, built on `Popover`. It is a menu to assistive technology (role
`menu`, with `menuitem` and `menuitemradio` items), with arrow keys, Home, End
and typeahead, and it returns focus to the trigger. It keeps itself inside the
screen and follows the trigger on scroll and resize.

```tsx
import { Button, Menu } from '@blockle/blocks';

<Menu
  items={[
    { label: 'Rename', onSelect: rename },
    { type: 'separator' },
    {
      type: 'radio-group',
      value: mode,
      onChange: setMode,
      items: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    },
  ]}
>
  <Button>Options</Button>
</Menu>;
```

- `children` is the trigger, one element, usually a `Button` or `IconButton`.
  `Menu` clones it, so it takes the accessible name you give it.
- `items` is a list of `MenuItem`: an action (`label`, `onSelect`, optional
  `disabled`, `startSlot`, `endSlot`), a `{ type: 'separator' }`, or a
  `{ type: 'radio-group', value, onChange, items }` whose items are
  `{ value, label, disabled?, endSlot? }`.
- Pass `textValue` for typeahead when `label` is not a plain string.
- It is uncontrolled unless you pass `open` and `onOpenChange`. `placement`
  defaults to `bottom-start`.
- Its other props (`className`, `aria-*`) go to the popover element.
