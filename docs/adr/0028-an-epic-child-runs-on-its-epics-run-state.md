# A child of an Epic runs on its Epic's run state

ADR 0023 places an In progress Ticket in a section of the In progress Lane by its own run state: its live Conversation, its PR reference and its Claim. The Epic workflow ("Working an Epic" in `docs/agents/issue-tracker.md`) keeps all three on the Epic. The run claims the Epic once and leaves its children unclaimed, opens one PR and adds it to the Epic, and its Conversation is the Epic's. The children stay In progress until `complete_ticket` on the Epic. So every child the run started showed as stalled in Action needed, with a Needs you row of its own beside the Epic's (seen on T1090, T1143).

So `laneOf` (`src/components/board/board-lanes.ts`) places an In progress child with no Claim, no PR reference and no live Conversation of its own by its Epic's: the Epic's Claim, its PR reference and its live Conversation. A child's own run state, when it has any, still wins. Then:

- Where the data comes from: a child's `epic` link (`EpicLink`, `src/tickets/epic-link.ts`) carries the Epic's `claim` and `hasPullRequest`, filled by the Tickets module. The fallback works when the Epic is planned on another Board (ADR 0025). Agents still see `epic` as `{ number, title, color }`; the MCP server strips the rest.
- Needs you folds those children. A child placed by its In progress Epic's run gets no Needs you row of its own: the Epic's row, in Needs you or In flight, carries it. An Epic in Review with two In progress children is one row, not three. A child whose own Conversation needs the User (waiting, idle, failed, interrupted) keeps its own Action needed row. A child whose Epic is not In progress, or is on another Board, keeps its own row too.
- A child is stalled only when its Epic is. Merged is still offered only by a Ticket's own PR reference: a child in Review by its Epic's PR leaves Merged to the Epic.
- `release_ticket_claim` warns that releasing an Epic's Claim with no PR reference leaves its In progress children stalled too.

This amends ADR 0023's section derivation for children of an Epic. The rest of that ADR stands. Board and Cockpit both read `laneOf`, so they still agree.

## Considered Options

- **Claim each child as the run starts it**: rejected. The Epic's Claim already covers its children, and a second Claim per child would be one more thing for a run to forget and release.
- **Hide In progress children of an Epic from Needs you whatever their state**: rejected. A child whose own Conversation waits on the User would then disappear.
- **Look the Epic up on the Board instead of carrying its run state on the link**: rejected. The Epic may be on another Board, which shows only its own Tickets (ADR 0025).

## Consequences

- A child moves between sections whenever its Epic's run does, with no change to the child itself.
- Releasing an Epic's Claim with no PR reference stalls the Epic and its started children together, all in the Epic's one Needs you row.
