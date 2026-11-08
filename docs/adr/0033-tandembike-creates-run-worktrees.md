# Tandembike creates and removes each run's worktree

Amends [ADR 0019](0019-tandembike-starts-agent-runs.md). Decided on 2026-11-08 (T1191) and built in phase 7 of [`software-factory-2.md`](../roadmap/software-factory-2.md) (T1193).

ADR 0019 left worktrees to each repository's conventions: with Parallel runs on, a run is told to work in a worktree of its own, starts in the main checkout and moves only by following that instruction. In practice runs got it wrong: an entered path refused (T1145), a nested log folder (T1146), a branch switched under a run by a parallel session (T1161). Every run also spent turns on setup that is the same for every repository.

With Parallel runs on, Tandembike now creates a git worktree for each Start, Review and Merge run before the run starts, off the Project's default branch, and starts the run with its cwd inside it. It runs the Project's prepare command there, if one is set, such as `npm ci`. It removes the worktree when the Conversation closes or its PR merges. The Agent still names the branch, commits, pushes and opens the PR, by the Playbook or the repository's rules. Triage, Spec, Plan, Setup and Retro run in the main checkout and change no code.

## Considered Options

- Keep worktrees with the Agent (ADR 0019): the failures above stay, and each repository needs a documented recipe.
- Tandembike also owns branches, commits and PRs: it would have to run `gh` and know each host, which ADR 0019 rejected for good reasons.

## Consequences

- Tandembike runs `git worktree add`, `remove` and `prune`, and records each Conversation's worktree path. It still runs no other git command.
- A run never shares the main checkout with another, so no instruction about worktrees goes in the brief.
- What to do with a dirty worktree at removal is left to phase 7's spec (keep and flag it, or refuse).
- `tandembike start` from a terminal uses the same worktree path (phase 10).
