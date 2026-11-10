---
name: implement
description: "Implement one Tandembike Ticket from claim to a pull request: branch, test-first build, the Check command, acceptance criteria, a review of your own diff, then merge or hand off as start_work's merge says."
disable-model-invocation: true
---

Adapted from the `implement` skill of `mattpocock-skills` (MIT, see the plugin's LICENSE).

Implement the Ticket the first message names, such as `T42`, in the repository you are in. You work on your own, so do not stop to ask the User unless the Ticket is ambiguous in a way that changes what you build. Everything you need about the Ticket comes from the Tandembike tools; everything about the repository comes from its own instructions (`CLAUDE.md` or `AGENTS.md`, if it has them) and its code. Where those instructions say something these steps say differently, the repository's instructions win.

## 1. Pick up the Ticket

Call `start_work` with the Ticket number. It claims the Ticket, moves a Todo Ticket to In progress and returns the bundle you work from: the description, the acceptance criteria (the definition of done), the comments, the Blockers, the Check command and `merge`, which says how you end at the pull request (step 8).

- A refusal names who holds the Claim or which Blockers are unresolved. Do not work around it: end with a short message saying what refused.
- State the Ticket's title. Read its comments: they may change what to build.
- When the reference names an Epic, `start_work` returns its children and the next one to work. Work that child and the others in Blocker order on one branch, then merge or hand off once for the Epic.

## 2. Branch

Create a branch off the repository's default branch, named `t<number>-<slug>` (for example `t42-fix-login-redirect`) unless the repository's instructions name another pattern. For an Epic, name it after the Epic. If the working directory is already a git worktree on a branch of its own, use that branch.

## 3. Build test-first

Work in small vertical slices: one behaviour at a time, never all tests first and then all code.

1. Write one test for the next behaviour through the public interface, and watch it fail for the right reason.
2. Write the least code that makes it pass.
3. Repeat. Refactor only while the tests are green.

Test what the code does, not how: no tests of private helpers or call order, and mock only at system boundaries. Follow the repository's test setup and conventions (runner, file layout, naming), found by reading a neighbouring test. Work that is pure styling, copy or documentation needs no test.

Run type checks and the single test files you touch as you go.

Keep the red-run list as you go: for each behaviour test, its name and the failing line of its red run (the assertion or error the runner printed). A test you wrote after the code goes on it as written after. Leave off tests that cover only styling or copy. When a subagent builds part of the work, ask for the same list in its report. The final diff cannot show test order, so this list is how the merge step sees that the work was test-first.

## 4. Check

Run the Check command from the `start_work` bundle once your work is complete, and fix everything it reports until it passes. When the bundle has no Check command, run the repository's own test and lint commands as its instructions name them. Do not open a pull request with a failing check; if you cannot make it pass, go to "When you cannot finish".

## 5. Acceptance criteria

Verify each acceptance criterion against the running code or its tests, not against your memory of writing it. Call `check_criterion` for each one as you verify it. A criterion you deliberately leave unmet: add a note with `add_note` saying why, and leave it unchecked.

## 6. Review

Commit your work first, then call the `review` skill on the diff against the default branch, with the Ticket's number. Fix the findings you agree with, say in a note on the Ticket (`add_note`) which you did not fix and why, run the Check command again, and commit.

## 7. Push and open the pull request

Commit messages name the Ticket (`T42`) and say what changed in plain words, unless the repository's instructions say otherwise.

- When the repository has a host CLI you can use, such as `gh` for GitHub, push the branch and open a pull request with it. The body says what changed, how you checked it (the Check command and what it covered), the red-run list from step 3, and which Ticket it is for (`T42`).
- When there is none, push the branch if a remote exists and say so in a note on the Ticket with `add_note`: the branch name, and that no pull request could be opened.

Then call `open_pr` with the pull request's URL, without `handOff`, to record the reference.

## 8. Merge or hand off

`start_work` returned `merge`, the Project's Auto-merge setting when you took the Claim. Only the User sets it; follow it, whatever the default branch's history suggests.

- **`merge: "approve"`**: hand off. Call `open_pr` with the URL and `handOff: true`: it releases your Claim and leaves the Ticket in Review for the User to approve the merge. Do not merge and do not call `finish_work` unless the User approves (see "Merge").
- **`merge: "auto"`**: merge it yourself, by "Merge", only when all of these hold: the Check command passes, your review has no unresolved findings (a finding you chose not to fix is explained in a note), every acceptance criterion is checked or a note says why it is not, you have read the red-run list (see "Merge"), and the pull request's checks are green. When one does not hold, call `add_note` saying which and why, then hand off as for `approve`. Do not call `finish_work`.

## Merge

Both triggers use these steps: `merge: "auto"` once its conditions hold, and the User's approval, a reply to this Conversation such as `Approved: merge T42 now by the Playbook's merge steps, then finish_work.` (the only approval with `merge: "approve"`). They match the `merge` skill's. First read the red-run list in the pull request body. A new behaviour test missing from it, or listed as written after the code: say which in a note on the Ticket (`add_note`). The list is self-reported and nothing checks it automatically; it does not block the merge by itself. Then merge the pull request you opened, from the worktree you are in:

1. Wait for the pull request's checks with the host CLI (`gh pr checks <number> --watch` for GitHub; poll no faster than every 30 seconds when your CLI cannot watch). A failing check that is not the branch being behind: go to step 5. No checks exist: continue, and say so in a note.
2. When the branch is behind the default branch or conflicts, rebase onto it (`git fetch origin`, `git rebase origin/<default>`), resolve conflicts keeping the intent of both sides without losing the Ticket's change, run the Check command when it is cheap, push with `git push --force-with-lease`, and go back to step 1. Rebase and push at most twice.
3. When the checks are green, merge with the host CLI (`gh pr merge <number> --merge`, unless the repository's instructions name another method). When it refuses, read why and go back to step 1 or 2 once.
4. Call `finish_work` with the Ticket number. It refuses while an acceptance criterion is unchecked: pass `override` with the reason only for a criterion you deliberately left unmet and explained.
5. When you cannot (a check fails, a conflict you cannot resolve with confidence, a refusal after one retry), call `add_note` saying what stopped you, with the pull request URL, and do not call `finish_work`. With `merge: "auto"` and your Claim still held, hand off with `open_pr` and `handOff: true`, so the Ticket waits at the Merge gate.

Never push to the default branch, and never merge with failing checks.

## 9. Feedback

If you hit friction worth a Ticket of its own (a missing tool or parameter, an unclear error, a vague Ticket), file at most 3 with `file_tickets` before you merge or hand off; Tandembike refuses a fourth. Search with `find_tickets` first. When a match exists, add a note to it with `add_note` instead of filing. Each Ticket you file:

- has a clear problem and how to reproduce it;
- is labelled `needs-triage` and `from:agent-run`;
- sits outside any Cycle and Epic (leave both out);
- names the Ticket you worked as its Origin (`originNumber`), so the Retro can find it.

File nothing when there was no friction.

## When you cannot finish

When you cannot finish (a check you cannot fix, a Blocker you discover, a Ticket that cannot be built as written), do not leave the Ticket stalled. Call `abandon_work` with a reason that says what you tried and what stopped you, so the next person can pick it up. If you opened a pull request already, say in the reason that it is open.

End your final message with one line: the pull request URL, or why there is none.
