---

name: implement
description: "Implement one Tandembike Ticket from claim to a pull request: branch, test-first build, the Check command, acceptance criteria, a review of your own diff, then hand off."
disable-model-invocation: true
---

Adapted from the `implement` skill of `mattpocock-skills` (MIT, see the plugin's LICENSE).

Implement the Ticket the first message names, such as `T42`, in the repository you are in. You work on your own, so do not stop to ask the User unless the Ticket is ambiguous in a way that changes what you build. Everything you need about the Ticket comes from the Tandembike tools; everything about the repository comes from its own instructions (`CLAUDE.md` or `AGENTS.md`, if it has them) and its code. Where those instructions say something these steps say differently, the repository's instructions win.

## 1. Pick up the Ticket

Call `start_work` with the Ticket number. It claims the Ticket, moves a Todo Ticket to In progress and returns the bundle you work from: the description, the acceptance criteria (the definition of done), the comments, the Blockers and the Check command.

- A refusal names who holds the Claim or which Blockers are unresolved. Do not work around it: end with a short message saying what refused.
- State the Ticket's title. Read its comments: they may change what to build.
- When the reference names an Epic, `start_work` returns its children and the next one to work. Work that child and the others in Blocker order on one branch, then hand off once for the Epic.

## 2. Branch

Create a branch off the repository's default branch, named `t<number>-<slug>` (for example `t42-fix-login-redirect`) unless the repository's instructions name another pattern. For an Epic, name it after the Epic. If the working directory is already a git worktree on a branch of its own, use that branch.

## 3. Build test-first

Work in small vertical slices: one behaviour at a time, never all tests first and then all code.

1. Write one test for the next behaviour through the public interface, and watch it fail for the right reason.
2. Write the least code that makes it pass.
3. Repeat. Refactor only while the tests are green.

Test what the code does, not how: no tests of private helpers or call order, and mock only at system boundaries. Follow the repository's test setup and conventions (runner, file layout, naming), found by reading a neighbouring test. Work that is pure styling, copy or documentation needs no test.

Run type checks and the single test files you touch as you go.

## 4. Check

Run the Check command from the `start_work` bundle once your work is complete, and fix everything it reports until it passes. When the bundle has no Check command, run the repository's own test and lint commands as its instructions name them. Do not hand off with a failing check; if you cannot make it pass, go to "When you cannot finish".

## 5. Acceptance criteria

Verify each acceptance criterion against the running code or its tests, not against your memory of writing it. Call `check_criterion` for each one as you verify it. A criterion you deliberately leave unmet: add a note with `add_note` saying why, and leave it unchecked.

## 6. Review your own diff

Commit your work first, then read the whole diff against the default branch as a reviewer who did not write it:

- **The Ticket.** Does it do what the Ticket and each criterion asked, and nothing more?
- **The repository.** Does it follow the conventions in the repository's instructions and the code around it?
- **Defects.** Edge cases, error paths, leftover debugging, missing tests, files that should not be committed.

Fix what you find, run the Check command again, and commit.

## 7. Push and open the pull request

Commit messages name the Ticket (`T42`) and say what changed in plain words, unless the repository's instructions say otherwise.

- When the repository has a host CLI you can use, such as `gh` for GitHub, push the branch and open a pull request with it. The body says what changed, how you checked it (the Check command and what it covered), and which Ticket it is for (`T42`).
- When there is none, push the branch if a remote exists and say so in a note on the Ticket with `add_note`: the branch name, and that no pull request could be opened.

Then call `open_pr` with the pull request's URL and `handOff: true`. That records the reference, releases your Claim and leaves the Ticket for the User to review and approve the merge. Do not merge the pull request yourself, and do not call `finish_work`, until the User approves (see "When the User approves the merge").

## When the User approves the merge

The User may reply to this Conversation with `Approved: merge T42 now by the Playbook's merge steps, then finish_work.` That is the only approval. Merge the pull request you opened, from the worktree you are in:

1. Wait for the pull request's checks with the host CLI (`gh pr checks <number> --watch` for GitHub).
2. When the branch is behind the default branch or conflicts, rebase onto it, resolve conflicts without losing the Ticket's change, push with `--force-with-lease`, and wait for the checks again. At most twice.
3. When the checks are green, merge with the host CLI (`gh pr merge <number> --merge`, unless the repository's instructions name another method), then call `finish_work` with the Ticket number.
4. When you cannot (a check fails after a rebase, a conflict you cannot resolve, a refusal), call `add_note` saying what stopped you, do not call `finish_work`, and say so. Never push to the default branch.

## 8. Feedback

If you hit friction that is worth a Ticket of its own (a missing tool or parameter, an unclear error, a vague Ticket), file at most a few with `file_tickets` before you hand off, each with a clear problem and how to reproduce it. Search with `find_tickets` first so you do not duplicate one. File nothing when there was no friction.

## When you cannot finish

When you cannot finish (a check you cannot fix, a Blocker you discover, a Ticket that cannot be built as written), do not leave the Ticket stalled. Call `abandon_work` with a reason that says what you tried and what stopped you, so the next person can pick it up. If you opened a pull request already, say in the reason that it is open.

End your final message with one line: the pull request URL, or why there is none.
