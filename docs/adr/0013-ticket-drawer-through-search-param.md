# A Ticket opens as a drawer through `?ticket=` on its Board

A Ticket used to open as an intercepted route in an `@ticket` parallel slot over its Board, with its own page at `/project/3/ticket/12`. On a client-side navigation Next keeps an unmatched slot's last content (the trap ADR 0008 records for `@breadcrumbs`), so deleting a Ticket from its drawer redirected to a Board that the slot then turned into a 404 (#60). We now open a Ticket only as a drawer that the Board renders itself, from a `?ticket=12` search parameter on the Board's own URL. There is no slot to go stale and one way to close: drop the parameter. The open tab is in the URL, so nothing has to work out which Board belongs behind a Ticket page. A single route, `/ticket/12`, resolves a Ticket to its own Board (its open Cycle's, else the Backlog), and every in-app link to another Ticket goes through it. A Ticket has no page of its own, and old Ticket URLs are not redirected.

We traded away the URL rule that a single item gets its own path segment, and a server re-render of the Board when its drawer opens, for removing a class of stale-slot bugs and the code that worked around them.

**Status:** accepted and built (#66). The drawer opens with `scroll={false}` and closes with `router.replace(…, { scroll: false })`, so the Board keeps its scroll position: Next scrolls to the top on navigation by default.
