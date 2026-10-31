# Setup checks a repository against Tandembike's checklist; the User decides

ADR 0019 tells a run only its situation and leaves how to work to the repository. Runs still depend on a few things in that repository, and nothing there may say them: a `CLAUDE.md` that loads the repository's instructions, the Tandembike Project to use, the Tandembike MCP server for Agents the User starts in a terminal, an allowlist for the Tandembike tools, and, with Parallel runs on, a worktree convention. Setup is a Conversation in which an Agent checks the repository against that list and offers to add what is missing. For Setup only, Tandembike's brief says what to check. The list is fixed in Tandembike's code and covers only what Tandembike relies on, so branch names and the rest of the repository's process stay the repository's own.

Setup is advisory and the User decides. It does not gate agent mode or Start, and Tandembike stores no pass or fail result. Whether a repository is "set up" is the Agent's judgement, not something Tandembike can check, and the User may have reasons to differ. Every edit waits for the User's Allow. Setup works in the main checkout and never commits, pushes or opens a PR: the User reviews the diff and commits it their own way. Committing would need the very branch and worktree conventions Setup may be adding.

## Considered Options

- Gate agent mode until Setup passes: a "passed" flag would claim more certainty than an Agent's reading of a repository gives, and it would block a User who knows their repository is fine.
- Let the Agent judge freely what "ready" means: there is no stable list, and it drifts into the repository's own process, which ADR 0019 leaves alone.
- Report only, never edit: the User then makes every fix by hand, which is the friction Setup exists to remove.
- Commit through the repository's branch and PR rules: this fails exactly when those rules are what is missing.

## Consequences

- Setup does not count toward the Project's cap on concurrent Start runs, but a Project has at most one running Setup at a time, since two would edit the same files in one checkout.
- Projects that already held Setup are not asked to run it again when the checklist changes; the User reruns it from the Project's agent settings.
