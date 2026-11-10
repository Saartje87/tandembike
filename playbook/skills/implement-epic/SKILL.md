---
name: implement-epic
description: "Implement a Tandembike Epic from claim to one pull request: its children in Blocker order on one branch, one review, then merge or hand off as start_work's merge says."
disable-model-invocation: true
---

Adapted from the `implement` skill of `mattpocock-skills` (MIT, see the plugin's LICENSE), for an Epic.

Implement the Epic the first message names, such as `T42`, in the repository you are in. The Epic is one unit: one Claim, one branch, one pull request. You work on your own, so do not stop to ask the User unless the Epic is ambiguous in a way that changes what you build. Where the repository's own instructions (`CLAUDE.md` or `AGENTS.md`) say something these steps say differently, the repository's instructions win.

## 1. Pick up the Epic

Call `start_work` on the Epic. It claims the Epic, which covers its children, and returns its description (the context they share), its children with their Statuses and Blockers, `nextChild`, the next one to work, and `merge`, which says how you end at the pull request (step 6).

- A refusal names who holds the Claim or which Blockers are unresolved. Do not work around it: end with a short message saying what refused.
- Read the Epic's description and comments before you start.

## 2. Branch

Create one branch off the repository's default branch, named after the Epic: `t<number>-<slug>` (for example `t42-checkout-flow`), unless the repository's instructions name another pattern. If the working directory is already a git worktree on a branch of its own, use that branch.

## 3. Work the children in Blocker order

Repeat until every child is Done, taking `nextChild` each time:

1. Call `start_work` on the child. A child under your own Epic Claim moves to In progress.
2. Build it test-first in small vertical slices: one test through the public interface, watch it fail for the right reason, write the least code to pass, repeat; refactor only while green. Mock only at system boundaries and follow the repository's test conventions. Pure styling, copy or documentation needs no test. Keep the red-run list as you go: each behaviour test's name and the failing line of its red run, or written after when it came after the code, leaving off tests that cover only styling or copy. When a subagent builds a child, ask for the same list in its report.
3. Run the Check command from the `start_work` bundle (or the repository's own test and lint commands) and fix everything until it passes.
4. Verify each acceptance criterion of the child against the running code or its tests, and call `check_criterion` for each as you verify it. A criterion you leave unmet needs an `add_note` saying why.
5. Commit on the shared branch. Commit messages name the child (`T43`).

Do not call `finish_work` on a child: the Epic's `finish_work`, once its pull request is merged, finishes its children with it (step 6).

When a child cannot be built as written, see "When you cannot finish".

## 4. Review once

When all children are built and the Check command passes, call the `review` skill on the whole branch against the Epic's spec and the children's criteria. Fix what you agree with, say in a note on the Epic what you did not and why, run the Check command again, and commit.

## 5. Push and open one pull request

When the repository has a host CLI you can use, such as `gh` for GitHub, push the branch and open one pull request for the Epic. The body says what changed per child (`T43`, `T44`), how you checked it, the red-run list per child, and which Epic it is for. When there is none, push the branch if a remote exists and say so in a note on the Epic with `add_note`.

Then call `open_pr` on the Epic with the pull request's URL, without `handOff`, to record the reference.

## 6. Merge or hand off

Follow the Epic's `merge` from step 1, the Project's Auto-merge setting when you took the Claim; only the User sets it.

- **`merge: "approve"`**: call `open_pr` on the Epic with the URL and `handOff: true`. That releases your Claim and leaves the Epic for the User to review and approve the merge. Do not merge and do not call `finish_work`.
- **`merge: "auto"`**: merge it yourself only when all of these hold: the Check command passes, your review has no unresolved findings (one you chose not to fix is explained in a note), every acceptance criterion of the Epic and its children is checked or a note says why not, and the pull request's checks are green. Before merging, read the red-run list, as the `implement` skill's "Merge" says. Then run the "Merge" steps of the `implement` skill on the Epic's pull request, ending with `finish_work` on the Epic, which finishes its unarchived children with it. When a condition does not hold, or the merge cannot be done, call `add_note` on the Epic saying why and hand off as for `approve`, without `finish_work`. Never push to the default branch.

## 7. Feedback

If you hit friction worth a Ticket of its own (a missing tool or parameter, an unclear error, a vague Ticket), file at most 3 with `file_tickets` before you merge or hand off; Tandembike refuses a fourth. Search with `find_tickets` first. When a match exists, add a note to it with `add_note` instead of filing. Each Ticket you file:

- has a clear problem and how to reproduce it;
- is labelled `needs-triage` and `from:agent-run`;
- sits outside any Cycle and Epic (leave both out);
- names the Epic you worked as its Origin (`originNumber`), so the Retro can find it.

File nothing when there was no friction.

## When you cannot finish

Do not leave the Epic stalled. Call `abandon_work` with a reason saying what you tried, what stopped you and which children are built. If you opened a pull request already, say so in the reason.

End your final message with one line: the pull request URL, or why there is none.
