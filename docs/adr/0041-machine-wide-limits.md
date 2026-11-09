# Machine-wide limits

Amends [ADR 0030](0030-autopilot-dispatches-the-active-cycles-ready-work.md): Autopilot's serialised `evaluate(projectId)` becomes one machine-wide pass.

Each Project has its own Start run limit and ceilings, so with Autopilot on in five Projects of two slots each, ten Claude runs can work at once on one laptop. No setting saw the total. This ADR adds limits that apply across Projects, on top of each Project's own. Round-robin sharing (T1253, below) and a machine daily spend ceiling (T1254) build on the same pass.

- **A machine cap.** `maxConcurrentRuns` in a new single-row `machine_settings` table, owned by the Tickets module (`getMachineSettings`, `setMachineSettings`). At least 1, default 3; no row means the defaults. It is set only through a Server Action on the Settings page, which the app header links to, and no MCP tool exposes it, so no Agent can raise its own limit.
- **A machine slot** is held by a run whose state is `running` or `waiting`, that is not Terminal (ADR 0039), and that is a Start or a Merge (the runs that hold a Project Start run slot, T1221) or a Triage Autopilot started. The User's interactive Conversations hold none, so talking to an Agent is never blocked by background work. The Conversations module counts them in `machineSlotsInUse()`.
- **User starts are refused at the cap.** A Start or Approve merge that would be the cap's next run is refused with "The machine runs its cap of N runs; wait for one to finish or raise the cap in Settings.", the same way the Project limit refuses. Autopilot's own starts and replies pass the same check. A User's reply is never refused (ADR 0031): it may take the machine over the cap, and Autopilot then dispatches nothing until the working runs drop below it.
- **One machine-wide pass.** Autopilot's evaluation was one serialised step per Project. It is now one pass over every unarchived Project, in Project id order. Any change, or a backoff timer, queues the pass, and a pass already queued is shared. Server start queues one pass that first resumes Autopilot's interrupted Conversations. A pass resumes first (the startup resume, then the transient resume of each Project), then shares the free slots round-robin, reading the free machine slots again before every run it starts. Every per-Project rule stays: the Start run limit, the Spend ceiling, the triage ceiling and one Triage run at a time. A failure in one Project does not stop the pass for the others.
- **Round-robin.** After the resumes, the pass runs turns. In each turn every Project is offered one run: its next Eligible build when it has room, otherwise its next Triage-eligible Ticket when Auto-triage allows one, so a build goes before a triage and a Project gets at most one run per turn. Turns go on until the machine's slots run out or no Project took a run; a Project that took none sits out the rest of the pass. A pass starts with the Project after the one served last (the next higher id, wrapping to the lowest). That cursor is kept in memory, so after a restart a pass begins at the lowest id. With 3 Projects of ready work and 2 free slots, two different Projects get a run.
- **Live.** Changing the machine settings publishes a `machine` change, so the header's "Runs N/M" updates over the events route, as it does when a Conversation changes.

## Considered Options

- Count every working run, interactive ones too: it would let background work block the User's own Conversations.
- Keep one evaluation per Project and have them share a counter: the order between Projects would depend on which change arrived first, and round-robin needs one place that sees every Project.

## Consequences

- Any change to any Project queues a pass over all Projects. Each step reads the database, which is cheap at this scale.
- A User's reply can leave the machine over its cap until runs finish.
