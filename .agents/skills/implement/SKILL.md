---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Before implementation, read `docs/agents/issue-tracker.md` and follow its development-ticket workflow. For a referenced Ticket, fetch it and state its title before starting. If the reference is ambiguous, ask. If one matching Ticket is identified, mark it `In progress` before coding; if multiple could match, ask which one.

Call the Skill tool with "tdd" where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, call the Skill tool with "code-review" to review the work. Mark the matching Ticket `Done` only after implementation, required checks, and review are complete.

Commit your work to the current branch.
