# Lanes are derived from Status, labels and run state

Superseded in part by [ADR 0024](0024-the-board-is-one-column-and-a-drag-only-reorders.md): the drag paragraph no longer holds, and the Board is one column. The Lane derivation stands; Todo is now called Queued and For human is called Your work.

Superseded in part by [ADR 0027](0027-an-epic-without-children-is-not-queued.md): a Todo Epic labelled `ready-for-agent` with no unarchived children is in Intake, not Todo (now Queued).

Amended by [ADR 0028](0028-an-epic-child-runs-on-its-epics-run-state.md): an In progress child of an Epic with no run state of its own takes its section from its Epic's Claim, PR reference and live Conversation.

The Board used to show one Lane per Status. The software factory (`docs/roadmap/software-factory.md`) needs more situations on the Board than three Statuses: a Todo Ticket still to be triaged, one ready for an Agent, one the User works on; later, an In progress Ticket that needs the User, is running, or waits for review. So a Lane is no longer a Status. The Board has five Lanes in a fixed order, Intake, Todo, In progress, For human and Done, and a pure function (`laneOf` in `src/components/board/board-lanes.ts`) derives the Lane of each Ticket from its Status, its triage state label and, in later Tickets, the run state of its Conversation:

- Todo with `needs-triage`, `needs-info` or no state label is in Intake.
- Todo with `ready-for-agent` is in Todo.
- Todo with `ready-for-human` is in For human.
- In progress and Done are in their own Lanes.

Status stays the fixed set Todo, In progress, Done, and nothing an Agent does over the MCP tools changes: `list_tickets` with `sort: "position"` and `sort_lane` still order by Status. A Lane has its own id and the Status a drop into it gives. A Lane's order is the order of its Status, filtered, so positions stay per Status.

A drag changes Status only. A drop from In progress or Done into Intake, Todo or For human gives Status Todo, at the end of the Todo order. A drop from one of those three into another is refused by the drag layer: the card snaps back and nothing is saved, because it would have to change a label. Moving a Ticket between them is done by changing its label, as triage does.

## Considered Options

- **New Statuses** (for example Intake, Ready, For human): rejected. Every Agent, the MCP tools, `sort: "position"`, Epic Status derivation and existing data depend on the three Statuses, and triage state labels already say which situation a Todo Ticket is in. A new Status would duplicate them and need a migration.
- **Triage by drag**, a drop between the Todo-Status Lanes swapping labels: rejected. A drag would then change labels as well as Status, and an Agent or the User editing labels directly would race with it.
- **A stored Lane per Ticket**: rejected. It would be a second source of truth beside Status and labels, and could disagree with them.

## Consequences

- Lane membership changes whenever a Ticket's labels do, with no Status change; the Board recomputes it on every render.
- A Todo Ticket created from the Board has no state label (or `needs-triage`), so it appears in Intake, not in the Todo Lane where the create field sits.
- Later Tickets add In progress sections and run state to `laneOf` without reshaping it.
