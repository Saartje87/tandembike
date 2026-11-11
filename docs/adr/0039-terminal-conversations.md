# Terminal Conversations

Decided on 2026-11-09 (T1237, phase 10 of [`software-factory-2.md`](../roadmap/software-factory-2.md), Epic T1196). Amends [ADR 0019](0019-tandembike-starts-agent-runs.md) on who starts a run and on how a run is observed, and the rule that every Conversation records a Run outcome ([ADR 0030](0030-autopilot-starts-start-runs.md) and the Stats page built on it).

A User who wants to work a Ticket by hand in a terminal lost everything Tandembike does for a run: the worktree, the Prepare command, the Stage's command and the brief. The Board could not see them either, so the Ticket looked Stalled or Eligible and Autopilot could start a second run on it.

## Decision

- **A third starter.** `tandembike implement T42` (named `tandembike start T42` until [ADR 0052](0052-the-cli-runs-the-server-in-the-background.md) gave `start` to the server) asks the running server, over a local-only JSON route (`/api/terminal`, ADR 0022), to start a Conversation **Started by Terminal** on the Ticket's Project (ADR 0037). It is a normal Conversation row, with a Ticket, an intent, a transcript and a worktree when its Stage gets one. The route is a thin wrapper over the Conversations module: it holds no logic, and returns the module's refusals as text. It is the one route that calls the module; Server Actions remain the only way the User's browser does.
- **Setup is the same as a UI run.** The module makes the worktree and runs the Prepare command as for a UI Start with Parallel runs on, and returns what the CLI needs: the Conversation id (the Agent-run ID), the cwd, the first message (the Stage's command and the Ticket number, as the UI sends it), the run brief, the run mode and the model. The brief gains a line saying the run is in a terminal and the User answers permission prompts and questions there.
- **The CLI runs `claude`; the server runs nothing.** The CLI spawns interactive `claude` in the cwd with inherited stdio, the bundled Playbook through `--plugin-dir`, the brief through `--append-system-prompt`, `--permission-mode` from the run mode, `--model` when set, the first message as the prompt, and `TANDEMBIKE_RUN` set to the Conversation id. When `claude` exits the CLI reports the end and exits with `claude`'s code.
- **State.** While the session is open the Conversation is `running`: In flight on the Board, with a Status line that shows the elapsed time and no cost. When the CLI reports the end it becomes `stopped` with a "Session ended" entry holding the exit code; ending twice changes nothing. A server restart leaves it alone (nothing in the server died).
- **It costs nothing against the caps.** A Terminal Conversation holds no Start run slot, counts against no Spend ceiling (it has no Autopilot Cycle and its cost stays 0) and records **no Run outcome**: Tandembike sees no result, cost or model of an interactive session. The Stats per Stage therefore count UI and Autopilot runs only. This amends "every Conversation records a Run outcome".
- **It holds its Ticket.** An open Terminal Start keeps its Ticket from being Eligible, as any open Start Conversation does, so Autopilot never starts a second run on it. An ended one holds it until the User closes it or sends the Ticket back to Todo.
- **The User answers in the terminal.** Reply, Stop and answers to permission requests and questions refuse a Terminal Conversation: "This Conversation runs in a terminal; answer it there." Its dialog has no reply box and no Stop, says "Running in a terminal" while open, and offers Close once it has ended.
- **Refusals.** Like a UI Start, except the Start run limit and the Spend ceiling: an unknown or archived Ticket, a Project without a repository path, a failed worktree or Prepare command (no Conversation stays open), and a Ticket that already has a working Start Conversation.

Later children of T1196 add to this mechanism: the Status line from the session's MCP calls, an idle timeout, `triage`, `spec`, `next`, `resume` and the Playbook plugin offer. Epic T1349 folds `next` into `tandembike implement` without a Ticket, which starts the next Eligible item of the folder's Project; `tandembike start <ticket>` and `tandembike next` are gone, with no alias. Only the CLI's command names changed: the terminal route's `start` and `next` actions and the Conversations module's terminal intents keep theirs. A session command finding the server down starts it first (ADR 0052).

## Consequences

- The Conversations module has a path with no live run: nothing in the server finishes a Terminal Conversation but the CLI's report, so a killed terminal leaves it `running` until the idle timeout of a later child.
- `holdsStartRunSlot` is false for it, and `interruptStale` skips it.
- A signal that kills the CLI before it reports leaves the Ticket In flight; this is the known gap the idle timeout closes.
- `claude --permission-mode` takes the run mode as is (`default` or `auto`).
