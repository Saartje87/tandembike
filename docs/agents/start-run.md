# Start run: working one Ticket

This repository's process for one Agent run on one Ticket, from claim to merge. The MCP server's instructions explain the tracker itself (ADR 0014). [`issue-tracker.md`](issue-tracker.md) holds the rest of the process: "Working an Epic", "Worktrees for parallel runs", specs and triage.

## Pick up

- Given a Ticket reference, fetch it with `get_ticket`, read its description and its `acceptanceCriteria` (the definition of done), then its comments with `list_comments`. Without one, look for a clearly matching Ticket in the `Tandembike` Project: ready Agent work is `list_tickets` with `status: "Todo", labels: ["ready-for-agent"], blocked: false, claimed: false`. Several could match: ask which. None clearly does: do the request without creating a Ticket unless asked.
- Claim it with `claim_ticket` and move it to `In progress` with `update_ticket` before you start. Working several Tickets, move each as it starts. An Epic: "Working an Epic".
- Branch and PR by "Git workflow" in `AGENTS.md`.

## The PR reference

Once you open the PR, add its URL to the Ticket as an External reference with `update_ticket` `addExternalReferences`, not as a comment. A PR closed and replaced: add the new URL beside the old one, since references are history, not status.

## The Claim, through merge

A Claim covers one Agent run's work, through its merge.

- The run that opens the PR waits for CI (`gh pr checks <number> --watch`). Green, with review complete and every acceptance criterion checked: merge with `gh pr merge <number> --merge`, then call `complete_ticket`. Red: fix the branch and wait again; when you cannot, comment on the Ticket why the PR stays open and release the Claim with `release_ticket_claim`. The Ticket stays `In progress`, and that plus the PR reference show it is taken.
- A later run that works on the open PR, for example on review findings, claims the Ticket for that work and releases it when done.
- When the merging run did not complete it, any later run that finds an `In progress` Ticket whose PR reference is merged with CI green does; failing both, the User does with the **Merged** button in the drawer.
- Abandoning the work with no PR leaves the Ticket stalled in the Board's Action needed section, so also move it back to `Todo`, or comment why it stays `In progress`.
- A run in a worktree of its own removes it last, by "Clean up" in "Worktrees for parallel runs".

## Completing

`complete_ticket` applies the completion rule in [`triage-labels.md`](triage-labels.md) and releases the Claim, as the Merged button does. Neither checks GitHub, so first check the PR is merged into `main`, CI is green and every acceptance criterion is checked. A criterion deliberately left unmet: say why in a comment first. Until then the Ticket stays `In progress`.

## Feedback as Tickets

Friction you hit while working a Ticket becomes a Ticket, because a reply nobody reads loses it: the Blocks and process feedback rules in `AGENTS.md` point here. File the Tickets at the end of the task, before you release your Claim or end the Conversation; nothing you learned survives it.

1. Check each claim against the installed types or the docs first.
2. Pick the Project the item is about: `@blockle/blocks` for Blocks friction, `Tandembike` for process and tooling friction.
3. Search that Project with `list_tickets` (a `query`, `includeArchived: true`). When a Ticket already covers the item, add a comment with the new repro and the workaround you used, and stop.
4. Otherwise create one Ticket per item in that Project, outside any Cycle or Epic. Its description has Problem, Repro, Expected, Workaround and Question sections; its acceptance criteria are taken from Expected. Labels: `needs-triage`, `bug` (a defect in existing behaviour) or `enhancement`, and a source label: `from:tandembike` for Blocks Tickets, `from:agent-run` for process Tickets.
5. Make its first comment "Found while working T<number>", naming the Ticket you were on.
6. Close your final message with one line per Ticket you filed or commented on, as a pointer to it, and nothing when there was none.

The factory leaves these Tickets alone, and only the User decides to label one `ready-for-agent`.
