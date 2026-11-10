# A run waiting on the User keeps its slot

Supersedes the premise of [ADR 0031](0031-a-reply-is-never-refused-by-the-start-run-limit.md) that an idle Start holds no slot; its "a reply is never refused" stands. Amends [ADR 0019](0019-tandembike-starts-agent-runs.md) (the Start run limit) and [ADR 0041](0041-machine-wide-limits.md) (the Machine slot and the Machine cap).

Tandembike runs on the User's own laptop, and its limits on parallel work are there to protect that machine. They did not. A Start whose turn ended waiting for the User's reply (Action needed, run state `idle`) gave up its Start run slot and its Machine slot, though its Claude process stayed alive. Autopilot gave the freed slot to the next Eligible Ticket, and when the User answered, ADR 0031 let the reply through regardless of the limit. With a cap of 3, two Tickets went idle, Autopilot started two more, the User answered both, and five ran at once: the laptop slowed down because of the work the cap should have kept in check.

The cap now bounds the Agent processes alive on the machine:

- **A Start or Merge holds its slot while its run is live**: `running`, `waiting` or `idle`. A Ticket in Action needed keeps its slot until the User answers, closes the Conversation, Stops it or sends the Ticket Back to Todo. `holdsStartRunSlot` and `holdsMachineSlot` say so, and the Conversations module counts only runs whose process is alive (`startRunSlotsInUse(projectId)`, `machineSlotsInUse()`); Autopilot reads its free slots from those counts.
- **A reply is still never refused** (ADR 0031). A User's reply into an idle run works in the slot the run already holds, so it no longer takes the machine over the cap. Autopilot's own replies stay limited.
- **A handoff ends the process.** When a turn ends with the Ticket in Review (In progress, a pull request among its External references and no Claim) or Done, the Conversations module ends the run's process and frees its slot. The Conversation stays open and `idle`, so the Board keeps showing the Ticket in Review (or Done), not Action needed or Stalled. A reply resumes the stored session; Approve merge resumes it too, and since that takes a slot again it is limited like a Merge Conversation.
- **Back to Todo and Done end the process too.** When a live Start's Ticket moves to Todo or Done, its process ends at once when idle, or when its turn ends.
- **An `interrupted` Conversation holds no slot**: it has no process. The User's reply resumes it and skips the limit, a rare, bounded overshoot after a restart or a crash.
- A Triage Autopilot started holds a Machine slot only while it works, as before.
- **A refusal names the slot holders.** A Start or Approve merge refused by Parallel runs off or the Machine cap names each Conversation holding a slot by its Ticket (`T12`, or `Conversation 7` without one) and marks those waiting on the User, so the User knows which one to answer or close.
- **One number for load.** The Project's max concurrent Start runs setting is dropped by a migration. Parallel runs stays as a property of the repository: off allows one slot-holding Start or Merge in the Project, on allows up to the Machine cap, with round-robin (ADR 0041) still sharing slots between Projects. The run brief and the Setup checklist keep reading Parallel runs.
- **Autopilot's headroom counts every live process.** Its free slots are the Machine cap minus `liveProcessesInUse()`: the slot holders, the User's own live Spec, Plan, Ask, Spar, Setup, Retro, New Ticket, Triage and Batch triage runs (idle ones included, until closed), and open Terminal Conversations (until the CLI reports the end). None of those holds a slot, so the cap never refuses them or `tandembike start`, and a Start the User presses is refused only by slot holders.

## Considered Options

- **Suspend an idle process after a timeout**, freeing its memory and slot while the Conversation waits. It makes the slot rule depend on time, so whether Autopilot may start work would change with the clock rather than with what the User did.
- **Autopilot pre-empts the oldest idle run** when it has Eligible work and no free slot. It would kill the work the User is about to answer.
- **Keep ADR 0031's rule** (idle holds nothing, a reply may overshoot): the overshoot is exactly the load the cap exists to prevent.

## Consequences

- Unanswered Action needed runs, overnight included, stall Autopilot: nothing new starts until the User answers, closes, stops or sends them back. The Pause reason makes that visible.
- Ending a process at a handoff costs a session resume on Approve merge or a later reply, as an interrupted Start already did.
- The "Runs N/M" header counts idle runs waiting on the User.
