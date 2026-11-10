# Autopilot dispatches the Active Cycle's ready work

Amended by [ADR 0041](0041-machine-wide-limits.md): the serialised evaluation is one machine-wide pass over every Project, within a machine cap.

Amended by [ADR 0049](0049-a-run-waiting-on-the-user-keeps-its-slot.md): a Start waiting on the User keeps its slot, Autopilot's free slots are the Machine cap minus every live Agent process, and a Project's limit is one Start with Parallel runs off, else the Machine cap.

Amended by [ADR 0040](0040-autopilot-triages.md): Autopilot's evaluation also starts Triage runs when a separate Auto-triage switch is on.

Amended by [ADR 0034](0034-transient-run-ends-are-resumed-once.md): a run that ends on a transient error is resumed once.

Amended by [ADR 0031](0031-a-reply-is-never-refused-by-the-start-run-limit.md): a User's reply can take a Project over its Start run limit, and Autopilot dispatches nothing until the working Start runs drop below it.

The User plans a Cycle of `ready-for-agent` Tickets and Epics, and until now had to press Start on each. **Autopilot** is a Project switch: while it is on and the Project has an Active Cycle, Tandembike starts a Start Conversation for each **Eligible** Ticket or Epic by itself, Started by Autopilot (T1126), with the same first message and brief as the Start button.

- **The switch is standing consent.** ADR 0019 let only the User start a run, one press at a time. Turning Autopilot on is the User's consent for the runs that follow, including runs that Agent-fed work causes: a spec run that files `ready-for-agent` children into the Active Cycle makes them Eligible. Autopilot never labels or moves a Ticket itself, so every dispatch traces to a `ready-for-agent` label the User, or an Agent the User started, put on. It leaves `needs-triage` and `needs-info` alone.
- **Eligible** is a Ticket or Epic in the Active Cycle that is Todo, labelled `ready-for-agent`, not blocked, unclaimed, not archived and not an Epic's child, and an Epic only with at least one child, with no open Start Conversation on it (not closed by the User), whatever state its run is in. The last rule covers the gap between a dispatch and the run's Claim, and is what stops retries. Back to Todo does not close a Conversation, so a Conversation from before the Ticket's latest move to Todo (children's, for an Epic) no longer counts, unless its run is still working.
- **Order and slots.** Eligible work goes in the Cycle Board's Todo Lane order, so dragging and `sort_lane` set the priority, and Autopilot starts at most as many as the Project's free Start run slots, by the cap the Conversations module already enforces. Parallel runs off makes it serial.
- **One serialised `evaluate(projectId)`.** Evaluations never overlap, and each reads the world afresh, so a burst of changes cannot start a Ticket twice, whatever order they arrive in. It runs on Ticket, Cycle and Conversation changes, and when the switch or a setting changes, and once for every Project at server start from Next's `register` hook in the Node.js runtime.
- **No retries, except one for a transient end** ([ADR 0034](0034-transient-run-ends-are-resumed-once.md) amends this). A failed or questioning run waits in Action needed for the User, and its Ticket is not Eligible while its Conversation is open. Back to Todo (T1094) is the retry path, since a Ticket sent back is Eligible again; so is closing the Conversation. A refused start, such as a missing repository path, is not retried until the next change.
- **Settings.** `autopilot` (default off) and `spendCeilingUsd` are Project agent settings, set only through Server Actions and absent from the MCP-visible `Project`, so no Agent can switch the factory on. Turning Autopilot on without a ceiling, or clearing the ceiling while it is on, is refused naming the ceiling field. Starting a Cycle does not turn it on. At or over the ceiling for the Active Cycle (the Conversations Autopilot started for it, each of which records its Cycle; resumes add to their Conversation), an evaluation dispatches nothing; the next change, such as a raised ceiling or the next Cycle, evaluates again.
- **Off stops new dispatches only.** Running runs finish.

Autopilot reads Tickets only through the Tickets module and starts runs only through the Conversations module, in-process, never through a route handler or an MCP tool.

## Considered Options

- Dispatch only on a timer: a slot freed or a Blocker done would wait for the next tick.
- Dispatch inside the Tickets module: it would have to know Conversations, which ADR 0004 keeps out of it.
- Automatic retries of every failure (ADR 0034 allows one for a transient end only): a failing run would spend money repeatedly on the same Ticket.

## Consequences

- The only code that starts a run without a User's press is `src/autopilot/`.
- A restart interrupts Autopilot's runs. At startup Autopilot resumes only its own interrupted Start Conversations whose Ticket is in the Active Cycle, not Done and not archived; the others stay interrupted for the User.
