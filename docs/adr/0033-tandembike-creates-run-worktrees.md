# Tandembike creates and removes each run's worktree

Amends [ADR 0019](0019-tandembike-starts-agent-runs.md). Decided on 2026-11-08 (T1191) and built in phase 7 of [`software-factory-2.md`](../roadmap/software-factory-2.md) (T1193).

Amended (T1557): a Start run's worktree is no longer detached. Tandembike creates it on a local branch for its Ticket, an Epic's for an Epic, from the same base as before (`origin/<default>`, else the local default) and without an upstream. It finds the branch by the Ticket's number: an existing local `ticket-<n>-*` branch, else the Playbook's old `t<n>-*`, else a new `ticket-<n>-<slug>` from the title (lower-case, hyphenated, at most 40 characters). The number ends at the hyphen, so T42 never takes `ticket-420-…`, and among several matches at one step the most recently committed wins. So a resumed Ticket, a Ticket renamed since, and one begun under the old naming get their branch back. When that branch is checked out in another worktree, the main checkout included, the start is refused naming it; it never falls back to detached. A repository with no commits is refused with "make a first commit". A Merge's worktree stays detached (ADR 0038). Tandembike therefore also runs `git for-each-ref`, `git rev-parse` and `git worktree list`, and the run names no branch: the brief says its worktree is already on its branch. A Start with Parallel runs on but no worktree (one begun before Parallel runs was on) is told to change nothing and tell the User, instead of making a worktree of its own.

ADR 0019 left worktrees to each repository's conventions: with Parallel runs on, a run is told to work in a worktree of its own, starts in the main checkout and moves only by following that instruction. In practice runs got it wrong: an entered path refused (T1145), a nested log folder (T1146), a branch switched under a run by a parallel session (T1161). Every run also spent turns on setup that is the same for every repository.

With Parallel runs on, Tandembike now creates a git worktree for each Start run, and with or without it for each Merge run (ADR 0038), before the run starts, off the Project's default branch (on the Ticket's branch since T1557), and starts the run with its cwd inside it. It runs the Project's prepare command there, if one is set, such as `npm ci`. It removes the worktree when the Conversation closes or its PR merges. The Agent still commits, pushes and opens the PR, by the Playbook or the repository's rules; since T1557 the branch is the runner's. Triage, Spec, Plan, Setup and Retro run in the main checkout and change no code.

## Considered Options

- Keep worktrees with the Agent (ADR 0019): the failures above stay, and each repository needs a documented recipe.
- Tandembike also owns branches, commits and PRs: it would have to run `gh` and know each host, which ADR 0019 rejected for good reasons.

## Consequences

- Tandembike runs `git worktree add`, `remove` and `prune`, and records each Conversation's worktree path. Since T1557 it also reads branches (`for-each-ref`, `rev-parse`, `worktree list`) to find the Ticket's; it never commits, pushes or deletes a branch.
- A run never shares the main checkout with another, so no instruction about worktrees goes in the brief.
- A worktree with uncommitted or untracked changes, or with commits no remote branch contains, is kept and flagged, never force-removed (T1208). Only a clean worktree is removed, at close, when the Ticket reaches Done and at server start. The Conversation shows "Worktree kept" with why and a Remove worktree button, which removes it after confirming if it is clean by then and refuses naming the state otherwise. The branch is never deleted.
- Every server shares `~/.tandembike/worktrees/` unless `TANDEMBIKE_DATA_DIR` moves it, while a dev server keeps its database in the checkout's `data/`. So `create` writes an owner mark beside each worktree, `<project id>/c<id>.owner`, holding the server's data folder. At server start the sweep of worktrees whose Conversation is gone only removes those this data folder made; a worktree another server made, or one without a mark, stays (T1279).
- `tandembike start` from a terminal uses the same worktree path (phase 10).
