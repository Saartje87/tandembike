# Overlays

Overlays place content above the current page. Use them only when the
interaction benefits from a floating or blocking surface; prefer inline
content for ordinary information.

## Choosing an overlay

- **`Dialog`** is for focused, modal content that requires attention or a
  decision. Control it with `open` and `onRequestClose`.
- **`Drawer`** is for a temporary panel-style surface. Control it with
  `open` and `onRequestClose`; `placement` picks the side (default `left`).
  See [Drawer caveats](#drawer-caveats).
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

Give dialogs an accessible name and, when useful, a description. Connect
visible title and body elements with `aria-labelledby` and `aria-describedby`.
The component handles Escape dismissal and restores focus after closing.

```tsx
"use client";

import { useState } from "react";
import { Button, Dialog, Heading, Text } from "@blockle/blocks";

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
request unhandled.

For a popover, attach a ref to the trigger and pass that ref as
`anchorElement`. Set `position` to choose its side; use `sticky` when the
popover should reposition as the window scrolls or resizes.

```tsx
"use client";

import { useRef, useState } from "react";
import { Popover } from "@blockle/blocks";

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
        position="bottom"
        onRequestClose={() => setOpen(false)}
      >
        Helpful context goes here.
      </Popover>
    </>
  );
}
```

Under jsdom an open popover counts as hidden, so a component test that opens
one calls `showOpenPopovers()` from `src/test/popover.ts` first
(T299). In a file with drag tests, call it inside
the `describe` that opens the popover: dnd-kit drags differently once the
Popover API exists. Blocks' `Popover` renders a plain `div`;
pass `role="dialog"` and an `aria-label` when it holds controls.

Keep focus, accessible names, and dismissal behavior in mind when choosing an
overlay. Do not use a tooltip for essential information or a modal dialog for
content that can be read inline.

## Drawer caveats

Checked against `@blockle/blocks-react` 2.8.1 (see T296 and T298):

- `Drawer.js` has no `'use client'` directive; import it only from a Client
  Component.
- It is a fixed 300px wide (or high) with no `size` prop, and a `className`
  replaces its own classes instead of adding to them. Style the content in a
  `Box` inside it; to change the width, target the dialog by a `data-`
  attribute with a `globalStyle`, as `ticket-drawer-shell.css.ts` does.
- It opens with `showModal()` and does not close in an effect cleanup. In a
  route Next.js preserves in a hidden `<Activity>`, render it only while shown
  (see `useIsShown` in `ticket-drawer-shell/use-is-shown.ts`); otherwise it
  stays open behind the next page and throws `InvalidStateError` when the
  route is shown again.
- Each new `Drawer` plays its slide-in again. To swap what it shows, such as
  content streaming in or another item, keep one `Drawer` mounted and put the
  `Suspense` boundary inside it, as `TicketDrawerShell` does (T333).
- It does not restore focus after closing.
- It closes on any Escape `keydown` that reaches `document`, and
  `onRequestClose` gets no reason. An in-place edit inside it that cancels on
  Escape must call `event.nativeEvent.stopImmediatePropagation()` in its
  React `onKeyDown`, since Next's React root is `document` too (see
  `claimEscape` in `keep-drawer-open/keep-drawer-open.ts`). It does not join
  `Dialog`'s nesting, so a `Dialog` opened from inside it leaves its Escape
  and outside-click handling on (T298).
