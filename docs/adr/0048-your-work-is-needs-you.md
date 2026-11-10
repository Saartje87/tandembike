# Your work is Needs you

Supersedes the section order of [ADR 0024](0024-the-board-is-one-column-and-a-drag-only-reorders.md), as [ADR 0026](0026-queued-follows-needs-you.md)'s revert restored it; the rest of both stands.

`ready-for-human` is how agents hand work to the User: a by-hand check filed by a run, a decision only the User can make. Such a Ticket sat in Intake, inside Needs you, until its triage was approved; approving it moved it to Your work, a section of its own that started closed on the Active Cycle's Board. The Needs you count dropped as if the request were handled, and the User missed it. A `ready-for-human` Ticket is a request, and approving its triage must not hide it.

- **Sections.** The Board's sections are Needs you, In flight, Queued and Done, with the Archived Tickets at the bottom. There is no Your work section.
- **Needs you's groups**, in order: Action needed, Review, Your work, Intake. Your work starts open, like the other groups, on every Board.
- **The Lane stays.** `laneOf` keeps the Your work Lane; only where the Board shows it changes. The group keeps its own drag order, like Intake; Action needed and Review stay oldest first.
- **Counting.** An unblocked Todo `ready-for-human` Ticket or Epic counts in Needs you: the Active Cycle's tab count and the browser tab's title. A blocked one shows in the group with its Blocked marker but does not count: it cannot be done yet.
- **The Backlog.** Its tab's warning badge stays Intake only. A Backlog `ready-for-human` Ticket shows in the Backlog Board's own Needs you without raising the warning.
- Planning Boards still hide empty sections, Needs you among them.

## Considered Options

- Keep Your work a section and open it on every Board: it would show, but not count, so the tab and title would still say nothing waits.
- Keep `ready-for-human` Tickets in Intake after approval: approving triage would no longer change what the Board shows, and Intake would mix untriaged work with handed-over work.
- Count a blocked one too: the count would ask for work the User cannot start.

## Consequences

- The Active Cycle's tab count and the browser tab's title rise with every unblocked `ready-for-human` Ticket on the Board.
- Flow's Ticket path names the Your work step's place as Needs you → Your work.
