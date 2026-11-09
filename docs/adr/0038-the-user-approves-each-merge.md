# The User approves each merge

Decided on 2026-11-09 (T1221, phase 9 of [`software-factory-2.md`](../roadmap/software-factory-2.md)). Amends [ADR 0019](0019-tandembike-starts-agent-runs.md) on who merges: a Start run no longer merges its own PR.

The roadmap made the User the **Merge gate**: a PR whose work is reviewed and whose checks are green waits for the User. Until now the Start run merged its own PR once CI was green, and the only button was **Merged**, for a PR the User had merged elsewhere. Nothing let the User approve a merge from Tandembike.

## Decision

- **A Start run hands off.** The Playbook's `implement` builds, checks, reviews its own diff and opens the PR with `open_pr` and `handOff: true`. It does not merge and does not call `finish_work`. The Ticket is in Review: a PR reference, no Claim, not Done.
- **Approve merge.** The drawer of a Ticket or Epic in Review shows **Approve merge** beside **Merged** and **Back to Todo**. Its Server Action calls the Conversations module, the only caller, so neither Autopilot nor an Agent can approve (ADR 0019). It is refused outside Review, without a PR reference, with a Claim, when the Ticket is Done and while a Conversation on it is running or waiting, and the refusal says why.
  - When the latest Start Conversation is open and idle or interrupted, it resumes it with a reply sent by the User: "Approved: merge T42 now by the Playbook's merge steps, then finish_work." The run that wrote the code merges it with its context, by the merge steps in `implement`.
  - Otherwise it starts a **Merge** Conversation with the Merge command, `/tandembike:merge T42` when blank. The `merge` skill checks out the PR branch in the Conversation's worktree, waits for the checks, rebases and pushes when the branch is behind or conflicts, merges through the host CLI and calls `finish_work`. When it cannot, it comments why with `add_note` and stops without finishing, so the Ticket is in Action needed (ADR 0023).
- **A Merge always has a worktree**, even with Parallel runs off. It checks out the PR branch, which must not disturb the User's checkout. It counts against the Start run limit like a Start.
- **Spend.** A merge the User approves stays outside the Spend ceiling. A Merge Conversation is started by the User, so it is outside already. When Approve merge resumes a Conversation Autopilot started, the cost of the User's turns on it is subtracted from the Autopilot spend.
- **Autopilot never starts or approves a Merge.** `start` refuses an Autopilot-started Merge. Autopilot's free slots count a working Merge.
- **Merged stays** for a PR the User merged by hand; both paths finish a Ticket.

Rejected: Tandembike calling `gh pr merge` itself (one host only, no conflict handling; ADR 0032's Playbook keeps the merge on the Agent's side), and the Start run asking in its Conversation whether to merge (the answer would be a free-text reply instead of one gate with a fixed meaning).
