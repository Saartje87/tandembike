# Autopilot triages

Amends [ADR 0030](0030-autopilot-dispatches-the-active-cycles-ready-work.md): Autopilot's serialised evaluation gains a triage step.

Every new Ticket sat in Intake until the User pressed Triage on it. **Auto-triage** is a second Project switch, separate from Autopilot, that makes Autopilot's `evaluate(projectId)` start Triage Conversations, Started by Autopilot, on Intake work by itself. Every Triage run ends in a triage proposal, and the User still approves each one (ADR 0030's standing consent does not extend to labels).

- **Its own switch, ceiling and consent.** `autoTriage` (default off) and `triageCeilingUsd` (dollars per local calendar day, no default) are Project agent settings, set only through Server Actions and absent from the MCP-visible `Project`. Turning Auto-triage on without a ceiling, or clearing the ceiling while it is on, is refused naming the ceiling field. It needs no Active Cycle and does not need Autopilot on. The switch is consent for Triage runs only; it never builds anything.
- **Triage-eligible.** A Ticket or Epic that is Todo and not archived, labelled `needs-triage` or with no state label, with no source label, no open Triage Conversation and no triage proposal since its latest change into its current state (read from the Activity log: creation, a move to Todo, or a state label added or removed). Setting a Ticket back to `needs-triage` makes it eligible again; a proposal the User rejected is not redone. The Backlog and every Cycle count. Autopilot takes them oldest first.
- **One run at a time.** The step starts a Triage Conversation only when no Triage run is working in the Project and today's triage spend is under the ceiling. The Conversation records no Cycle, so it never counts against the per-Cycle Spend ceiling, and it takes no Start run slot and no worktree: it runs in the main checkout. A Triage run's end, a proposal and a label change evaluate the Project again, as every change does.
- **Spend.** `autopilotTriageSpend(projectId, dayStart)` in the Conversations module sums the cost of the Autopilot-started Triage runs that ended since the start of the local day, from Run outcomes, plus the cost so far of a running one. At or over the ceiling the step starts nothing; the switch stays on, and the next day or a raised ceiling lets it go on. The Backlog Board's header shows the spend and "triage paused: over ceiling".
- **Restricted runs.** `RunOptions` gains `disallowedTools`, passed to the SDK. An Autopilot-started Triage run disallows `mcp__tandembike__update_ticket` and `mcp__tandembike__file_tickets`, so `propose_triage` and `add_note` are its only writes. A Triage run the User starts is not restricted, so a Project's own Triage command still works. Every Triage run starts on the Project's triage model when set.
- **Off stops new Triage runs only.** A running one finishes. Startup resume and the transient resume stay for Start Conversations.

## Considered Options

- Make Autopilot's switch cover triage: Autopilot needs an Active Cycle and a per-Cycle ceiling, and triage is Backlog work with a per-day bound.
- Let Autopilot apply `ready-for-agent` itself: the label is the User's consent to spend money on a Ticket (ADR 0030), so every triage stays a proposal.

## Consequences

- The Autopilot module is still the only code that starts a run without a User's press.
- Two ceilings exist: the Spend ceiling per Cycle, for Start runs, and the Triage ceiling per day, for Triage runs.
