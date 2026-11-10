# Batch triage

Amends [ADR 0040](0040-autopilot-triages.md): an open Batch triage holds its Tickets out of Triage-eligible.

Triage worked one Ticket at a time: the User's Triage button on one Ticket, or Auto-triage taking the oldest Triage-eligible one. Clearing a Board's Intake meant a Conversation per Ticket, and no run saw two Tickets at once, so none could spot a duplicate. **Batch triage** is a Conversation intent about one Board, a Cycle or the Backlog, in which one Agent run triages the Board's Intake and ends each Ticket in a triage proposal the User approves as usual.

- **One Conversation per Board.** Project-scoped, recording the Board (`batchTriageCycleId`, null for the Backlog) on the Conversation. At most one is open (unhidden, any state) per Board: starting another returns the open one and starts nothing. Closing it lets the next press start a new one.
- **The User starts it** with the **Triage N** button on the Active Cycle's, each Prepared Cycle's and the Backlog's Board header, hidden when N is 0. Autopilot never starts one.
- **Which Tickets.** The Board's Triage-eligible Tickets and Epics (ADR 0040's rule, which already leaves `needs-info` out), oldest first, computed by Autopilot's `batchTriageTickets(projectId, cycleId)` from the same rule Auto-triage acts on. No Pause reason applies: the switch, the Triage ceiling and a working Triage run do not stop the User.
- **Fixed list.** The numbers are recorded on the Conversation (`batchTriageTickets`) when it starts and given in its first message. A Ticket filed later is not added; the Agent re-reads each before proposing and skips one no longer eligible.
- **The hold.** Triage-eligible now reads: no open Triage Conversation _and not listed in an open Batch triage_. A listed Ticket counts as under that Conversation (`underTriageConversation`, naming it) until the User closes it, by ADR 0040's "open means not closed": a Ticket the run skipped stays held until then.
- **Propose only.** Every run of a Batch triage Conversation, the User's replies included, disallows `mcp__tandembike__update_ticket` and `mcp__tandembike__file_tickets`; its writes are `propose_triage` (duplicates and splits allowed, between listed Tickets too) and `add_note`.
- **No ceiling.** Like a Triage the User starts: it runs in the main checkout, takes no Start run or Machine slot, records no Cycle for Spend and does not count against the Triage ceiling. It starts on the Project's triage model when set. Its cost shows on the Conversation, and the User stops it there.

## Considered Options

- A Triage Conversation per Ticket, started in bulk: no run would see the other Tickets, so duplicates between them go unnoticed, and N Conversations crowd the dialog.
- Nudge Auto-triage to take the Board first: it needs the switch and a ceiling, and works one Ticket per run.
- Compute the list live on each run: a long run would pick up Tickets filed while it works, and the User could not tell what one press covered.

## Consequences

- Autopilot's eligibility rule reads the open Batch triages of the Project, so Auto-triage and a Batch triage never triage the same Ticket at once.
- A Batch triage left open after its run ends holds every listed Ticket it did not propose on, until the User closes it.
- Approving the proposals stays one by one, in each Ticket's drawer.
