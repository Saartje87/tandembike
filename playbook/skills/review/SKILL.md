---
name: review
description: "Review the current branch's diff against the Ticket's acceptance criteria and the repository's instructions, and return findings. Use before opening a pull request, or when asked to review changes."
---

Review the changes on the current branch as a reviewer who did not write them. The caller may name a Ticket such as `T42` (or an Epic) and a base; otherwise the Ticket is the one in your conversation and the base is the repository's default branch.

## What to read

1. The diff of the branch against the base (`git diff <base>...HEAD`), and the files it touches where the diff alone is not enough.
2. The Ticket's description and acceptance criteria, with `get_ticket`. For an Epic, read its spec and each child's criteria.
3. The repository's instructions (`CLAUDE.md` or `AGENTS.md`, if it has them) and a neighbouring file or test for the conventions in use.

## What to check

- **The Ticket.** Does the diff do what each acceptance criterion asked, and nothing more? Is a criterion met only on paper?
- **The repository.** Does it follow the instructions and the code around it: layout, naming, test setup, no barrel files or leftovers the instructions forbid?
- **Removed surfaces.** When the diff removes or moves a UI surface (a page, panel, card, menu or drawer section), list every action it offered (buttons, menu items, links, shortcuts, drag targets) and find where each one lives now: elsewhere in the diff, elsewhere in the app, or in an open Ticket that adds it (`find_tickets`). Flag as a defect each action with no new home, unless the Ticket says to drop it.
- **Defects.** Edge cases, error paths, concurrency, leftover debugging, missing tests for new behaviour, files that should not be committed.

Run the repository's Check command when you doubt a claim; do not trust the author's word that it passes.

## What to return

A list of findings, most serious first. For each: the file and line, what is wrong, why it matters and the fix you suggest. Mark each as a defect, a missing test, a convention break or a nit. Say plainly when you found nothing. Do not edit files, commit or call workflow tools that change a Ticket: the caller decides which findings to fix.
