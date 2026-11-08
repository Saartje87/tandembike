# The Board is one column, and a drag only reorders

[ADR 0026](0026-queued-follows-needs-you.md) changed the Board's section order and has been reverted: the section order below is in force again.

The Project had two views of the same Tickets: the five-Lane Board (ADR 0023) and the one-column Cockpit of the Active Cycle. The Cockpit grouped the Lanes by what the User needs to do first, and the User preferred it. So every Board (the Active Cycle's, each Prepared Cycle's and the Backlog's) is now that one column, the Cockpit tab and the five-Lane Board code are gone, and the view keeps the name Board.

The Board shows these sections, each a grouping of the Lanes that `laneOf` derives: Needs you (Action needed, Review and Intake), In flight (Running), Your work, Queued and Done, with the Archived Tickets at the bottom. Two Lanes are renamed to what the Board shows: Todo is Queued and For human is Your work. The derivation in ADR 0023 stands with the new names. Status, triage labels and `sort_lane` behave as before.

A drag only reorders rows within one section; it never changes a Status or a label. A drop across sections changes nothing. Queued (the Autopilot priority), Your work and Intake can be reordered; Needs you keeps its oldest-first order and Done its newest-first order. A Status changes through the Ticket drawer. This replaces the drag paragraph of ADR 0023, under which a drop gave a Status.

## Considered Options

- **Keeping the five-Lane Board for planning**, with the one-column view for the Active Cycle only: rejected. Two views of the same Tickets disagree about where a Ticket is and double the code to maintain. The planning tools the Board had (order by drag, inline create, filter, multi-select, Move to Cycle, attach to an Epic) were added to the one column instead.
- **Status-by-drag between stacked sections**, a drop into Done or In progress giving a Status: rejected. The sections are groupings of Lanes, not Statuses, so most drops would have to change a label or fail, and the Running section follows the run, which a drag cannot start or stop.
- **A Cockpit tab beside the Boards**: rejected. It shows the Active Cycle only, so Prepared Cycles and the Backlog would still need a Board, and the Project would again have two views of the same Tickets.

## Consequences

- Rows have no actions in the list. Merged and Back to Todo live in the Ticket drawer. The User may revisit this after using the new Board.
- `/cockpit` redirects to the Active Cycle's path, or to the Backlog when there is none.
- Attaching a Ticket to an Epic moves from dropping on a chip to an Add to Epic menu in the selection bar and the drawer.
