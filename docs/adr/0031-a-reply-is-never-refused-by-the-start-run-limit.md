# A reply is never refused by the Start run limit

Partly superseded by [ADR 0049](0049-a-run-waiting-on-the-user-keeps-its-slot.md): an idle Start, waiting on the User, now keeps its slot, so a User's reply into it adds no load; a reply is still never refused. The overshoot this ADR accepted remains only for a reply that resumes an interrupted, stopped or closed run.

ADR 0019 caps a Project's concurrent Start runs and refuses a Start beyond the cap rather than queue it. ADR 0030 lets Autopilot fill the free slots, and an idle Start, one waiting for the User's reply, holds no slot. Together they locked the User out of their own Conversations: Autopilot gave the idle Start's slot to the next Ticket, and when the User replied, the reply was refused because the Project already had its Start runs working (T1185).

The User must always be able to answer their Conversations. So:

- **A reply sent by the User skips the Start run limit**, whatever its run's state: live and idle, interrupted (by a restart or a run that died), or stopped or closed, which the reply reopens and resumes. The Conversations module skips the check in `reply` when it is sent by the User, both when the reply goes into the live run and when it starts a run that resumes the stored SDK session.
- **A Project may go over its limit for a while** (since ADR 0049, only when a reply resumes a run that had no process). Autopilot pays it back: its free slots are the limit minus the slot holders, so at or over the limit it dispatches nothing until enough runs end or stop.
- **New Starts stay limited**, whether the User or Autopilot begins them: a Start beyond the cap is still refused, not queued.
- **Autopilot's own replies stay limited**, such as its startup resume of its interrupted Conversations. Only a message from the User skips the limit, since only the User can be locked out of a Conversation they are in.

This amends ADR 0019's cap and ADR 0030's slots. The rest of both stands.

## Considered Options

- An idle Start keeps its slot: no reply is ever refused, but a Start waiting overnight for the User blocks Autopilot from all other work.
- Queue the reply until a slot frees: the User's answer would sit unsent with no run to show it, and a queue is what ADR 0019 chose not to build.
- Skip the limit for every reply, Autopilot's too: Autopilot's startup resume could then start any number of runs at once.

## Consequences

- The cap is a ceiling on what Tandembike starts by itself or as a new Start, not on what the User keeps going. A User answering several interrupted Starts at once can run more than the cap, for as long as those runs work; since ADR 0049, answering idle ones cannot, as each holds its slot.
- The reply form shows any refusal under the input; a Server Action that throws instead of returning a refusal is shown too, never left as an uncaught rejection.
- Tickets errors are recognised by kind, not class identity, because Next bundles one copy of the Tickets errors for instrumentation, where Autopilot creates the shared Conversations module, and another for Server Actions.
