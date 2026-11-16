# Start run: working one Ticket

What this repository adds to one Agent run on one Ticket. The Playbook's `/tandembike:implement` (or `/tandembike:implement-epic` for an Epic) holds the run itself, from `start_work` through the branch, the build, the review, the pull request and the merge or hand-off; the MCP server's instructions explain the tracker (ADR 0014). [`issue-tracker.md`](issue-tracker.md) holds the rest of this repository's process: "Working an Epic", "Worktrees for parallel runs", specs and triage.

## Playbook runs in this repository

Start runs here run the Playbook: the Project's Start commands are blank, and this repository has no `implement` skill of its own. The Playbook defers to the repository's instructions, so these steps add to it:

- **Worktree and branch.** A run Tandembike started is already in its own worktree, on the Ticket's branch `ticket-<number>-<slug>`, which the runner names (ADR 0033). Any other run, such as a terminal session or a subagent sharing the checkout, works in a worktree of its own by "Worktrees for parallel runs" in [`issue-tracker.md`](issue-tracker.md), so a parallel session in the same checkout cannot switch its branch. The Git guardrail refuses a commit on `main` or a detached HEAD.
- **Review.** Use the Playbook's `review` skill (`tandembike:review`) for every change, docs-only included, not `code-review`.
- **Browser check.** When the change touches routing, navigation, a drawer or dialog, or a Server Action that navigates, run the real-browser check by [`browser-checks.md`](browser-checks.md) after the review, with its helper and a throwaway server of your own: jsdom cannot run Next's routing, so those bugs pass every test.
- **The User's running app.** Port 4747, its database and `.next/` belong to the User's running app, which your MCP tools reach Tickets through. Serve the app only in your own worktree on another port, and build only there, by "Ports" in "Worktrees for parallel runs" in [`issue-tracker.md`](issue-tracker.md).
- **Migrations.** A run that adds a database migration follows "Migrations in parallel runs" in [`issue-tracker.md`](issue-tracker.md).
- **Feedback.** File friction by "Feedback as Tickets" below; it adds this repository's Projects and labels to the Playbook's feedback step.
- **Merge.** This Project's Auto-merge is on, so `start_work` returns `merge: "auto"` and the run merges its own pull request by the Playbook's conditions (ADR 0043), with `gh pr merge --merge`. When the pull request is behind `main` or conflicts, update it by merging `origin/main` into the branch (`git fetch origin`, `git merge origin/main`) and pushing normally with `git push`, never by rebasing and force-pushing: the Git guardrail denies every force push, `--force-with-lease` included.

## The PR reference

Once you open the PR, add its URL to the Ticket with `open_pr`, which records it as an External reference, not as a comment. A PR closed and replaced: add the new URL beside the old one, since references are history, not status.

## The Claim, through merge

The Playbook's merge and hand-off steps apply as written. This repository adds:

- A later run that works on an open PR, for example on review findings, claims the Ticket for that work with `start_work`, which leaves its Status as it is, and releases it with `open_pr` and `handOff: true` when done.
- When the merging run did not complete it, any later run that finds an `In progress` Ticket whose PR reference is merged with CI green calls `finish_work`; failing both, the User does with the **Merged** button in the drawer.
- A terminal session or subagent in a worktree of its own removes it last, by "Clean up" in "Worktrees for parallel runs".

## Completing

`finish_work` applies the completion rule in [`triage-labels.md`](triage-labels.md) and releases the Claim, as the Merged button does. It is how an Agent moves any Ticket to `Done`, with a PR or without one (a split spec, `ready-for-human` work, research); do not set `Done` with `update_ticket`.

## Feedback as Tickets

Friction you hit while working a Ticket becomes a Ticket, because a reply nobody reads loses it: the Blocks and process feedback rules in `AGENTS.md` point here. The Playbook's feedback step holds the template (Problem, Repro, Expected), the cap of three and the search for a match first; this repository adds:

1. **A Blocks behaviour seen only in jsdom is a test-setup suspect first**, such as an unflushed render: read [`flaky-tests.md`](flaky-tests.md), then confirm it in a real browser by [`browser-checks.md`](browser-checks.md). Only a browser that reproduces it earns a Blocks Ticket or a note on one; otherwise fix the test.
2. **The Project.** `@blockle/blocks` for Blocks friction, `Tandembike` for process and tooling friction. Search it with `find_tickets` (`projectName`, a `query`, `includeArchived: true`) before you file.
3. **Labels.** `needs-triage`, `bug` (a defect in existing behaviour) or `enhancement`, and the source label: `from:tandembike` for Blocks Tickets, `from:agent-run` for process Tickets. A **Workaround** and a **Question** section go with the Playbook's template when you have them.
4. **The first comment**, with `add_note`: "Found while working T<number>", naming the Ticket you were on.
5. Close your final message with one line per Ticket you filed or commented on, and nothing when there was none.

`file_tickets` also refuses a feedback Ticket whose title overlaps (Jaccard 0.75 or more) a feedback Ticket in the Project that is neither Done nor archived, and names the match: add a note to that Ticket instead. Without the `X-Tandembike-Run` header nothing is capped. The factory leaves these Tickets alone, and only the User decides to label one `ready-for-agent`.
