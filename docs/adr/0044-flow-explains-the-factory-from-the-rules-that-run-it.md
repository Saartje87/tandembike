# Flow explains the factory from the same rules that run it

Builds on [ADR 0030](0030-autopilot-dispatches-the-active-cycles-ready-work.md), [ADR 0040](0040-autopilot-triages.md) and [ADR 0041](0041-machine-wide-limits.md).

The factory (Intake, triage, Queued work, In flight runs, Review, the Merge gate, Cycles, ceilings and run limits) was defined in the glossary and the ADRs but visible in the app only through its effects. A Ticket could sit in Queued and never start, with no way to see why. Each Project now has a **Flow** tab that explains its factory, and the Ticket drawer says why a Ticket is where it is.

- **One rule, with reasons.** Autopilot's room check and its Eligible and Triage-eligible filters are one rule that answers with reasons, not a yes or no. Autopilot's public interface has a read, `explain(projectId)`, returning for Autopilot and for Auto-triage either running or the **Pause reasons**, and for each Todo Ticket or Epic either Eligible with its place in line, or every reason it is not, and the same for Triage-eligible. The reasons are a closed union of tagged values in `src/autopilot/explanation.ts`; the UI turns them into words.
- **Dispatch acts on the same answer.** The pass starts a build only when `explain`'s build part is running and starts its first Eligible Ticket, and a Triage run likewise. So the existing Autopilot tests prove the explanation, and there is no second copy of the rules for the UI to drift from.
- **Every reason, not the first.** The User fixes everything at once. "No Eligible work" and "no Triage-eligible work" are named only when nothing else stops the engine, since they say there is nothing to do rather than that something is in the way.
- **Flow reads, and switches.** Flow shows the Ticket path with the Board's own Lane counts, the Cycle loop with this Project's Cycles, the setup (each Stage's command, Check and Prepare commands, run mode and model, ceilings with their spend) linking to Settings, and the Pause reasons. Its Autopilot and Auto-triage switches are the Board header's and Settings', calling the same Server Action, so refusals are identical. Every other setting stays read-only on Flow.
- **Live.** Flow is a server-rendered page refreshed by LiveUpdates on every change, like the Board, so the reasons clear as soon as their cause does.

## Considered Options

- Compute the explanation in the UI from settings and Tickets: a second copy of the rules, wrong exactly when the rules change.
- Show only the first reason: the User would fix one cause and find the next.
- A diagram library for the Ticket path and Cycle loop: Blocks layout plus small arrow components is enough, and keeps the theme's tokens.

## Consequences

- Any change to what Autopilot starts is a change to `explain`, and shows on Flow and in the drawer at once.
- The Autopilot instance is created on first use (`appAutopilot()`), so pages can read `explain` before or without `startAppAutopilot()`, which alone makes it act.
