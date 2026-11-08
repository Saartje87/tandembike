---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets. `docs/agents/issue-tracker.md` owns the Ticket workflow (Claims, Status, acceptance criteria, Done) and `AGENTS.md` owns the git workflow; each step below points to the section it follows.

1. **Pick up the Ticket.** Read `docs/agents/issue-tracker.md`. For a referenced Ticket, fetch it and state its title. If the reference is ambiguous, or several Tickets could match, ask which one. Claim it and move it to `In progress` by "Development work in this repository", or for an Epic by "Working an Epic".
2. **Branch.** Create the branch "Git workflow" in `AGENTS.md` names: `ticket-<number>-<slug>` off `main`, or the Epic's branch.
3. **Build.** Call the Skill tool with "tdd" where possible, at pre-agreed seams. Run typechecking and single test files regularly, and `npm run check` once at the end; it must pass.
4. **Review.** Commit first: the review and the browser check both read committed work. For a change that touches code, call the Skill tool with "code-review" and fix what it finds. When it touches routing, navigation, a drawer or dialog, or a Server Action that navigates, also run a real-browser check by `docs/agents/browser-checks.md`: jsdom cannot run Next's routing, so those bugs pass every test. For a docs-only or copy-only change (the boundary `AGENTS.md` uses to exempt tests), check the change against each acceptance criterion inline instead. Check off each criterion as you verify it.
5. **Hand off.** Commit, push the branch, open the PR with the "pr" skill, and add its URL to the Ticket (or the Epic) as an External reference with `update_ticket` `addExternalReferences`. File the friction you hit by "Feedback as Tickets" in `docs/agents/issue-tracker.md` here.
6. **Merge.** Wait for CI, then merge and complete the Ticket (or the Epic), or release the Claim when CI stays red, by the Claim rule in "Development work in this repository". Then, outside a worktree, switch to `main` and pull. The step is done when the feedback is filed (or there was none), and the PR is merged and the Ticket is `Done`, or the PR is open with a comment on the Ticket saying why and the Claim is released.
