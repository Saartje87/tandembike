# An Epic without children is not Queued

ADR 0023 puts every Todo Ticket labelled `ready-for-agent` in Queued, Epics included. An Epic with no children then showed in Queued as if it were the next thing to run. It is not ready. An Epic is eligible for Autopilot only once it has an unarchived child (`docs/roadmap/software-factory.md`, "Eligible"), so someone has to split it first. This happens whenever a spec flow stops between `/to-spec`, which labels the Epic `ready-for-agent` when it publishes it, and `/to-tickets`, which creates the children. It also happens for Epics made by hand.

So `laneOf` (`src/components/board/board-lanes.ts`) places a Todo Epic labelled `ready-for-agent` with no unarchived children, on any Board, in Intake. It then shows in Needs you and counts there.

- Children on another Board count. An Epic whose unarchived children are all planned elsewhere stays Queued and still says "No children in this Cycle (N elsewhere)".
- Archived children do not count, as everywhere an Epic's children are counted.
- Only `ready-for-agent` changes. An empty `ready-for-human` Epic stays in Your work. `needs-triage` and unlabelled Epics were already in Intake. In progress and Done Epics are unaffected.
- Its Intake row reads "Ready for an Agent once split: no children yet. Triage it to split it." in place of "No children yet". Like every row, it offers no actions.
- The rule is derived in the app, with no change to `/to-spec` or `/to-tickets`, so it holds for the stock skills and for hand-made Epics. Creating the children stays an Agent run's job (`/to-tickets`). When that run stops, the User resumes it or presses Triage on the Epic (`docs/agents/issue-tracker.md`, empty-Epic triage).

This replaces the `ready-for-agent` bullet of ADR 0023 for an Epic without children. The rest of that ADR stands.

## Considered Options

- **A "not ready" marker on the Epic's row in Queued**: rejected. It is weaker than placing the Epic where the User looks first.
- **`/to-spec` publishing without the label, and `/to-tickets` adding it**: rejected. The stock `/to-tickets` must not modify the parent issue, and hand-made Epics would slip through.
- **A new Needs you group, "Not split yet"**: rejected. It would be a second rule beside the Lane derivation.

## Consequences

- An Epic moves from Intake to Queued as soon as its first child is created, with no label change.
- Intake now holds one kind of `ready-for-agent` work. Its Needs you row shows the `ready-for-agent` label as its triage tag.
- Follow-ups: T1140 (make the stock skills work unedited) and T1141 (a "Split into Tickets" action for an empty Epic).
