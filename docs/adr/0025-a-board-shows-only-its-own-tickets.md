# A Board shows only its own Tickets

A Cycle's Board is the scope of its Cycle: what is planned in it, and nothing else. Two things broke that. The Active Cycle's Needs you also listed the Backlog's Intake, because runs file their feedback outside any Cycle and the User should see it while the Cycle runs; that Intake also counted in the Active Cycle's tab and the browser-tab title. And an Epic's row listed all its children, including those planned in another Cycle or in the Backlog, with a state read from their Status alone.

Both are reversed. Every Board, each Cycle's and the Backlog's, shows only its own Tickets. The Backlog's Intake is on the Backlog's Board, and the Backlog's tab shows its own Intake count in a badge beside its open Tickets, counted as the Active Cycle's Needs you is. An Epic's row lists only its children on that Board, and the Board filter keeps an Epic's row by those children only. One exception stays: an Epic planned elsewhere joins a Cycle's Board as the row holding its children planned there. An Epic's row with none of its children on the Board says where they are: "No children yet", or "No children in this Cycle (N elsewhere)", or "in the Backlog" on the Backlog's. Its cost still covers every child (T1066), since it is what the Epic cost, not what the Board holds.

This replaces the GLOSSARY's earlier rule that Intake counts in the Cycle and the Backlog.

## Considered Options

- **Keeping the Backlog's Intake on the Active Cycle**: rejected. It makes the Active Cycle's Board, its tab count and the browser-tab title disagree with what the Cycle holds, and the Backlog's own tab badge now flags new Intake instead.
- **Listing an Epic's children elsewhere, greyed**: rejected. A Board would again show Tickets it does not hold, and their state could only come from their Status. The Ticket drawer still lists every child.

## Consequences

- Feedback filed by runs into the Backlog no longer raises the Active Cycle's Needs you count; the User sees it through the Backlog tab's Intake badge.
- `cockpitOf` takes only the Board's Tickets: its `elsewhere` parameter is gone.
