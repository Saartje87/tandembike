# Issue tracker: Local Tandembike app (MCP)

Tickets and Projects live in the local Tandembike app. Use its MCP server at `http://localhost:3000/api/mcp` through an MCP-capable client; the app must be running on `localhost:3000`. The endpoint uses stateless Streamable HTTP. Use the MCP tools, not `gh`, `glab`, `.scratch/` files, direct database access, or hand-written HTTP requests.

## Available operations

- `list_projects`: find an existing Project and its id before creating one.
- `create_project`, `rename_project`: manage Projects.
- `list_tickets`: find Tickets; filter by Project, Status, labels (a Ticket must have every given label) and/or `query` (a case-insensitive substring of the title or description), and include archived Tickets when needed. It returns `{ tickets, nextCursor }`, at most `limit` Tickets a page (default 50, at most 200), oldest-created first; pass `nextCursor` back as `cursor` with the same filters for the next page, until it is `null`. Results leave out descriptions unless `includeDescription` is set; read one Ticket's description with `get_ticket`.
- `get_ticket`: read a Ticket by its number before starting work or changing its description.
- `create_ticket`, `update_ticket`: create and update Tickets. `update_ticket` replaces the full description when a new description is supplied, so preserve existing content when editing it. It also takes `addLabels` and `removeLabels`, applied atomically with the other fields (removals first).
- `update_tickets`: apply the same Status, `addLabels` and/or `removeLabels` to an explicit list of at most 50 Ticket numbers. It reports `updated` and `failed` per Ticket; a result with any failure is an error, but the Tickets in `updated` were still changed.
- `list_labels`, `add_ticket_labels`, `remove_ticket_labels`: read and change Ticket labels. Reuse a label from `list_labels` when one fits. `create_ticket` also takes `labels`.
- Acceptance criteria: a Ticket's optional, ordered checklist, separate from its description; `get_ticket` returns it as `acceptanceCriteria` (each with `id`, `text` and `checked`). `create_ticket` takes an initial list. `update_ticket` with `acceptanceCriteria` replaces the whole list: give `id` to keep an existing criterion, leave it out for a new one; criteria left out are removed. `set_acceptance_criteria_checked` checks or unchecks criteria by id without touching the rest. Checking criteria never changes the Status.
- `list_comments`, `add_comment`, `edit_comment`, `remove_comment`: read and write comments on a Ticket. Comments you add are authored `agent`; you can edit or remove only those, never the User's. Removing a comment deletes it permanently.
- `list_blockers`, `add_blocker`, `remove_blocker`: read and change which Tickets block which. `add_blocker` and `remove_blocker` take `blocker` (the Ticket that must be resolved first) and `blocked` (the Ticket that waits for it). A Blocker is resolved once it is Done or archived. Every Ticket carries `blockedBy` (its Blockers' numbers) and `blocked` (whether any is unresolved); `list_tickets` with `blocked: false` finds Tickets that are ready to start.
- `archive_ticket`, `restore_ticket`: archive or restore a Ticket. Tickets cannot be deleted.
- Cycles (ADR 0010): goal-led plans of a Project's Tickets, each `Prepared`, `Active` (at most one per Project) or `Archived` (read-only history).
  - `list_cycles`: a Project's Cycles, oldest first, each with its `state` and `ticketNumbers`.
  - `create_cycle`, `rename_cycle`: a new Cycle starts `Prepared` and empty; an `Archived` one cannot be renamed.
  - `plan_ticket`, `unplan_ticket`: put a Ticket into a Prepared or Active Cycle of its Project, or take it out. Only open (not `Done`), non-archived Tickets can be planned, and a Ticket is in at most one Cycle that is not `Archived`. A member that becomes `Done` or is archived stays in its Cycle.
  - `list_tickets` with `cycleId`: the Tickets of one Cycle, or with `cycleId: null` the Backlog, the Tickets in no Prepared or Active Cycle.
  - `start_cycle`: make a Prepared Cycle `Active`. While another Cycle is Active it is refused; pass `confirmArchiveActive: true` only after the User agrees, which archives the Active Cycle and rolls its open, non-archived Tickets into the started one in one step.
  - `archive_cycle`: archive the Active Cycle, finished or not. Its Tickets keep their Status; its unfinished ones return to the Backlog.

Ticket Statuses are `Todo`, `In progress`, and `Done`. Move a Ticket to `In progress` when starting work and `Done` when finishing it. When completing a Ticket, remove its active triage state label (`needs-triage`, `needs-info`, `ready-for-agent`, or `ready-for-human`) in the same `update_ticket` call that sets the Status to `Done`. Preserve category labels such as `bug` and `enhancement`; do not remove `wontfix` as part of this completion rule. Refer to Tickets as `#<number>`.

## Development work in this repository

Use the existing Project named `Tandembike` for software-development work on this codebase. Resolve its id with `list_projects`; do not create a second Project for repository work. Before implementation, look for a clearly matching Ticket in that Project. If the user gave a Ticket reference, fetch that Ticket and use it. If exactly one existing Ticket clearly matches, update it to `In progress` before starting. If several Tickets could match, ask which one; if none clearly matches, proceed with the user's request without creating a Ticket unless asked. Once you open the Ticket's PR (see "Git workflow" in `AGENTS.md`), post its link as a comment on the Ticket with `add_comment`. Update the relevant Ticket to `Done` only once its PR is merged into `main` with CI green, review is complete, and its acceptance criteria are checked off (see below). Until then it stays `In progress`. When work spans multiple Tickets, update each Ticket as it starts and mark each `Done` only when its work is merged and verified.

## Triage and Blockers

Record triage roles as labels: one category label (`bug` or `enhancement`) and one state label; the allowed state roles are listed in `triage-labels.md`. When moving a Ticket to a new triage state, swap the state labels in one `update_ticket` call with `removeLabels` and `addLabels` (plus any other field changes, such as the description). Post triage notes as a comment with `add_comment`, starting with `> *This was generated by AI during triage.*`; leave the description alone unless the triage changes what the Ticket asks for. Older Tickets may still have a `## Triage notes` section in the description; leave it in place. Record blocking relationships with `add_blocker`, not in the description. Older Tickets may still have a `Blocked by: #<number>` line in the description; when you touch one, add those Blockers with `add_blocker` and delete the line, preserving the rest of the description. Represent `wontfix` with the `wontfix` label and keep the Ticket active.

## Acceptance criteria

Store a Ticket's acceptance criteria in its `acceptanceCriteria` field, never as a `- [ ]` checklist in the description or in a comment. When a skill's template (such as a `to-tickets` issue or a `triage` agent brief) has an acceptance-criteria checklist, pass those items as `acceptanceCriteria` on `create_ticket` or `update_ticket` and leave that section out of the description or comment. Confirm with `get_ticket` that they were stored.

Older Tickets may still carry an acceptance-criteria checklist in the description; when you touch one, move those items into `acceptanceCriteria` (keeping their checked state) and delete the checklist, preserving the rest of the description.

While working a Ticket, check off each criterion with `set_acceptance_criteria_checked` as you verify it. Move the Ticket to `Done` only once every criterion is checked; if one is deliberately left unmet, say why in a comment first.

## When a skill says “publish to the issue tracker”

Create one Ticket per approved work item in the selected Project, using the MCP tools, with its acceptance criteria in `acceptanceCriteria`. Create them in dependency order and record each dependency with `add_blocker`.

## When a skill says “fetch the relevant ticket”

Call `get_ticket` with the Ticket number and read its full description and its `acceptanceCriteria`, the definition of done, then `list_comments` for its comments.
