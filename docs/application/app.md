# Tandembike user guide

Tandembike is a local ticket tracker that also runs a small software factory: Agents build your Tickets in their own worktrees, and you decide what gets built and what gets merged. The words below are the glossary's (`GLOSSARY.md`); the decisions behind them are in `docs/adr/`.

For how one Project's factory is set up right now, open its **Flow** tab. For why one Ticket is where it is, open it: its drawer says so in one sentence under the Status.

## Projects

A Project holds the Tickets of one repository. Its tabs are the **Backlog**, its **Active Cycle** and each **Prepared** one, the **History** of archived Cycles, **Flow** and **Settings**. On Settings you set the repository path, the Check and Prepare commands, the Agent run mode and model, each Stage's command, and the switches and ceilings below. Only you change these; Agents cannot.

## Tickets and the Board

A Ticket has a Status: Todo, In progress or Done. An **Epic** groups child Tickets of the same Project and is built as one unit, in one run on one branch. A Ticket can be blocked by other Tickets until they are Done or archived.

The Board shows a Backlog's or a Cycle's Tickets in sections:

- **Needs you**: what waits on you. **Action needed** holds runs that ask, stop or fail; **Review** holds Tickets whose run opened a pull request; **Your work** holds Tickets triaged as `ready-for-human`, work handed to you that Autopilot leaves alone (a blocked one shows but is not counted); **Intake** holds Tickets still to triage.
- **In flight**: Tickets whose run is working.
- **Queued**: Tickets triaged as `ready-for-agent`, in the order Autopilot takes them.
- **Done**.

An empty section says what belongs there and how work gets there, and **How this Project runs** at the top of the Board opens Flow.

## Triage

A new Ticket starts in Intake. Triage gives it a category (`bug` or `enhancement`) and a state: `ready-for-agent`, `ready-for-human`, `needs-info` or `wontfix`. You triage by hand, or press Triage to have an Agent propose it; with **Auto-triage** on, Autopilot starts those Triage runs itself, one at a time, within the Project's **Triage ceiling** per day. Every proposal waits for you to approve or reject it.

## Cycles

A Cycle is a goal-led plan of Tickets. You make one by hand, or a **Plan** run proposes a Prepared Cycle toward a goal; it never starts one. Only you start a Cycle, and a Project has at most one Active Cycle. When every Ticket is Done the Board says the Cycle is complete; you can hold a **Retro** on it, then archive it into the History.

## Autopilot

With **Autopilot** on and an Active Cycle, Tandembike starts a Start run for the Cycle's **Eligible** work by itself: Todo, `ready-for-agent`, unblocked and unclaimed, in the Queued order, up to the Project's free Start run slots. It needs a **Spend ceiling** per Cycle and pauses once the Cycle's Autopilot spend reaches it. The **Machine cap** and **Machine ceiling** on the machine Settings page limit runs and spend across all Projects.

When Autopilot or Auto-triage starts nothing, Flow lists every **Pause reason**, such as no Active Cycle, switched off, over a ceiling or no free run slot. Flow also has both switches.

## The Merge gate

A run builds its Ticket in its own worktree and opens a pull request; the Ticket then waits in Review. By default a run never merges its own pull request: you approve each merge with **Approve merge**, and a Merge run merges it. With the Project's **Auto-merge** on, a run merges its own pull request once its checks, its review and every acceptance criterion pass, and hands it to you when they do not.
