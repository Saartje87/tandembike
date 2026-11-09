---
name: merge
description: "Merge the pull request of one Tandembike Ticket or Epic the User approved: check out its branch, wait for the checks, rebase when it is behind, merge with the host CLI, then finish the Ticket."
disable-model-invocation: true
---

Merge the pull request of the Ticket or Epic the first message names, such as `T42`. The User approved this merge by clicking Approve merge, so you do not ask again. You work on your own: end with a short message saying what happened. Everything about the Ticket comes from the Tandembike tools; everything about the repository from its own instructions (`CLAUDE.md` or `AGENTS.md`, if it has them) and its host CLI. Where those instructions say something these steps say differently, the repository's instructions win.

## 1. Find the pull request

Call `get_ticket` with the number and read its External references and comments: the pull request URL is the reference that points to a pull request. A Ticket without one, or a pull request that is already merged, is not yours to merge: add a note with `add_note` saying so and stop (see "When you cannot merge").

You are in a git worktree Tandembike made for this run, detached at the default branch. Do not use another worktree. Do not call `start_work`: the Ticket has no Claim to take, and you do not build anything.

## 2. Check out the branch

Fetch, then check the pull request's branch out detached in this worktree: `gh pr checkout <number> --detach` for GitHub, or `git fetch origin <branch>` and `git checkout --detach FETCH_HEAD`. Detached, because the run that built the branch may still have it checked out in another worktree. Push later with `git push origin HEAD:<branch>`.

## 3. Wait for the checks

Wait until the pull request's checks finish, with the host CLI (`gh pr checks <number> --watch` for GitHub). Poll no faster than every 30 seconds when your CLI cannot watch.

- All green: go to step 5.
- A check failed: go to "When you cannot merge", unless the failure is clearly the branch being behind, in which case go to step 4.
- No checks exist: continue, and say in your note that none ran.

## 4. Rebase when the branch is behind or conflicts

When the pull request is behind the default branch or reports conflicts, rebase onto the default branch: `git fetch origin`, `git rebase origin/<default>`. Resolve each conflict by keeping the intent of both sides, without losing the Ticket's change. Then run the Check command the repository's instructions name, when it is cheap, push with `git push --force-with-lease origin HEAD:<branch>` and go back to step 3. Rebase and push at most twice; a third time is a loop, so stop.

When a conflict is not one you can resolve with confidence, or the checks fail after a rebase, go to "When you cannot merge". Never push to the default branch, and never merge with failing checks.

## 5. Merge

Merge with the repository's host CLI (`gh pr merge <number> --merge` for GitHub, unless the repository's instructions name another merge method). When it refuses, read why and go back to step 3 or 4 once; otherwise go to "When you cannot merge".

Then call `finish_work` with the Ticket number. It completes the Ticket and leaves cleanup of your worktree to Tandembike. End with one line: the merged pull request URL.

## When you cannot merge

Call `add_note` on the Ticket saying what you tried and what stopped you: the failing check or the conflicting files, and the pull request URL. Do not call `finish_work` and do not call `abandon_work`: the Ticket stays in Review and shows as needing the User. End with one line saying the merge did not happen and why.
