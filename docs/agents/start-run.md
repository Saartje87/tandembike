# Start run: working one Ticket

This repository's process for one Agent run on one Ticket, from claim to merge. The MCP server's instructions explain the tracker itself (ADR 0014). [`issue-tracker.md`](issue-tracker.md) holds the rest of the process: "Working an Epic", "Worktrees for parallel runs", specs and triage.

## Pick up

- Given a Ticket reference, begin with `start_work`: it claims the Ticket, moves a `Todo` one to `In progress` and returns the whole Ticket, with its description, its `acceptanceCriteria` (the definition of done), comments, Blockers, Epic, Cycle and this Project's Check command. A refusal names who holds the Claim or which Blockers are unresolved: tell the User. Working several Tickets, `start_work` each as it starts. An Epic: "Working an Epic".
- Without a reference, `next_work` returns the top ready item of the Active Cycle in Board order, or says why there is none (no Active Cycle, nothing ready, everything blocked or claimed): tell the User then. It does not see Conversations, so it can return a Ticket the User has a Start Conversation open for; ask when unsure. Then `start_work` it. Several could match: ask which. None clearly does: do the request without creating a Ticket unless asked.
- `start_work` takes your Agent-run ID from the run Tandembike started. A `tandembike start` session needs no `agentRunId`; in any other terminal session, pass `agentRunId`, a unique ID for the run, to `start_work` and to the other tools that name your run.
- Branch and PR by "Git workflow" in `AGENTS.md`.

## Playbook runs in this repository

Start runs here run the Playbook's `/tandembike:implement`, or `/tandembike:implement-epic` for an Epic: the Project's Start commands are blank, and this repository has no `implement` skill of its own. The Playbook defers to the repository's instructions, so these steps add to it or override it:

- **Worktree.** A run Tandembike started is already in its own worktree; create the branch there. Any other run works in a worktree of its own, by "Worktrees for parallel runs" in [`issue-tracker.md`](issue-tracker.md), so a parallel session in the same checkout cannot switch its branch.
- **Branch.** Name it by "Git workflow" in `AGENTS.md` (`ticket-<number>-<slug>`), not the Playbook's `t<number>-<slug>`. Before each commit, check that `git branch --show-current` names it: the Git guardrail refuses a commit on `main` or a detached HEAD.
- **Review.** Commit first, then call the Playbook's `review` skill (`tandembike:review`) on the diff against `main`, for every change, docs-only included. Do not use `code-review` for a run's review.
- **Browser check.** When the change touches routing, navigation, a drawer or dialog, or a Server Action that navigates, also run a real-browser check by [`browser-checks.md`](browser-checks.md) after the review: jsdom cannot run Next's routing, so those bugs pass every test.
- **Feedback.** File friction by "Feedback as Tickets" below; it says more than the Playbook's step (which Project, the category label, the first comment).
- **Merge.** The run merges or hands off as `start_work`'s `merge` says, by "The Claim, through merge" below, as the Playbook does (ADR 0043). It does not override the Playbook here: runs on this repository merge their own PRs because the Tandembike Project's Auto-merge is on, and the merge method is `gh pr merge --merge`.

## The PR reference

Once you open the PR, add its URL to the Ticket with `open_pr`, which records it as an External reference, not as a comment. A PR closed and replaced: add the new URL beside the old one, since references are history, not status.

## The Claim, through merge

A Claim covers one Agent run's work, through its merge or its hand-off. Whether the run merges its own PR is `start_work`'s `merge`: the Project's Auto-merge setting when the Claim was taken, which only the User sets (ADR 0043).

- `merge: "auto"`: the run that opens the PR waits for CI (`gh pr checks <number> --watch`). Green, with review complete and every acceptance criterion checked (or a note saying why not): merge with `gh pr merge <number> --merge`, then call `finish_work`. Red: fix the branch and wait again; when you cannot, comment on the Ticket why the PR stays open (`add_note`) and hand it off with `open_pr` and `handOff: true`, which releases the Claim.
- `merge: "approve"`: hand off with `open_pr` and `handOff: true` once the PR is open, and do not merge; the User approves the merge from the drawer (ADR 0038). Either way a handed-off Ticket stays `In progress`, and that plus the PR reference show it is taken.
- A later run that works on the open PR, for example on review findings, claims the Ticket for that work with `start_work`, which leaves its Status as it is, and releases it with `open_pr` and `handOff: true` when done.
- When the merging run did not complete it, any later run that finds an `In progress` Ticket whose PR reference is merged with CI green calls `finish_work`; failing both, the User does with the **Merged** button in the drawer.
- Giving up on the work: `abandon_work` with a `reason`. It comments the reason, releases your Claim and moves an `In progress` Ticket back to `Todo` unless it has a PR reference, so nothing stays stalled in the Board's Action needed section.
- A terminal session or subagent in a worktree of its own removes it last, by "Clean up" in "Worktrees for parallel runs".

## Completing

`finish_work` applies the completion rule in [`triage-labels.md`](triage-labels.md) and releases the Claim, as the Merged button does. It is how an Agent moves any Ticket to `Done`, with a PR or without one (a split spec, `ready-for-human` work, research); do not set `Done` with `update_ticket`. It refuses while an acceptance criterion is unchecked; a criterion deliberately left unmet goes in its `override` reason, which it posts as a comment. It checks nothing on GitHub, so with a PR first check it is merged into `main` with CI green. Until then the Ticket stays `In progress`.

## Feedback as Tickets

Friction you hit while working a Ticket becomes a Ticket, because a reply nobody reads loses it: the Blocks and process feedback rules in `AGENTS.md` point here. File the Tickets at the end of the task, before you finish, abandon or hand off the Ticket, or end the Conversation; nothing you learned survives it.

1. Check each claim against the installed types or the docs first.
2. Pick the Project the item is about: `@blockle/blocks` for Blocks friction, `Tandembike` for process and tooling friction.
3. Search that Project with `find_tickets` (`projectName`, a `query`, `includeArchived: true`). When a Ticket already covers the item, add a note with `add_note` giving the new repro and the workaround you used, and stop.
4. Otherwise create one Ticket per item in that Project with `file_tickets`, outside any Cycle or Epic. Its description has Problem, Repro, Expected, Workaround and Question sections; its acceptance criteria are taken from Expected. Labels: `needs-triage`, `bug` (a defect in existing behaviour) or `enhancement`, and a source label: `from:tandembike` for Blocks Tickets, `from:agent-run` for process Tickets.
5. Make its first comment, with `add_note`, "Found while working T<number>", naming the Ticket you were on.
6. Close your final message with one line per Ticket you filed or commented on, as a pointer to it, and nothing when there was none.

`file_tickets` caps this: a run may file at most 3 feedback Tickets (those with a source label), and a batch that would exceed it is refused whole; add a note with `add_note` to one you filed already instead. It also refuses a feedback Ticket whose title has a word overlap (Jaccard) of 0.75 or more with a feedback Ticket in the Project that is neither Done nor archived, and names the match; add a note to that Ticket. Tickets without a source label are never capped or compared. Without the `X-Tandembike-Run` header nothing is capped.

The factory leaves these Tickets alone, and only the User decides to label one `ready-for-agent`.
