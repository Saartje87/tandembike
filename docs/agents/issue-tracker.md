# Issue tracker: Local Tandembike app (MCP)

Tickets and Projects live in the local Tandembike app. Use its MCP server at `http://localhost:3000/api/mcp` through an MCP-capable client; the app must be running on `localhost:3000`. The endpoint uses stateless Streamable HTTP. Use the MCP tools, not `gh`, `glab`, `.scratch/` files, direct database access, or hand-written HTTP requests.

## Available operations

- `list_projects`: find an existing Project and its id before creating one.
- `projectName`: `list_tickets` and `create_ticket` take a Project's name, matched ignoring case, in place of `projectId`. An unknown name is refused with the names of the existing Projects, so a stale name is caught at once; giving both is refused unless they name the same Project.
- `create_project`, `rename_project`: manage Projects.
- `list_tickets`: find Tickets; filter by Project (`projectId`, or `projectName`), Status (one, or a list such as `["Todo", "In progress"]` for any of them), labels (a Ticket must have every given label) and/or `query` (a case-insensitive substring of the title or description), and include archived Tickets when needed. It returns `{ tickets, nextCursor, total }`, at most `limit` Tickets a page (default 50, at most 200), oldest-created first, or with `sort: "position"` in Board order (the lanes Todo, In progress, Done in turn, each in the order the User ranked them; it needs `projectId` or `projectName`); pass `nextCursor` back as `cursor` with the same filters for the next page, until it is `null`. Under `sort: "position"` a Ticket dragged on the Board between calls can be skipped or repeated. `total` is how many Tickets match the filters over all pages, whatever the `cursor`, so one call with `limit: 1` answers "how many?". Each row is a summary by default: `number`, `title`, `status`, `labels` and `blocked`, plus `projectId` when the call is not for one Project. Pass `detail: "full"` for whole Tickets (description, `type`, `epic`, `blockedBy`, `claim`, acceptance criteria, `children`, Board position, `archived` and timestamps, as `get_ticket` returns them), or read one Ticket with `get_ticket`.
- `get_ticket`: read a Ticket by its number before starting work or changing its description. It returns the Ticket's `type` (`Ticket` or `Epic`), its `epic` (`{ number, title }` of the Epic it is a child of, or `null`), and an Epic's `children`, each with `number`, `title`, `status`, `archived`, `blockedBy` and `blocked`.
- `create_tickets`: create from 1 to 50 Tickets in one Project in one call, in order, each with the fields of `create_ticket`, optionally all under one Epic (`epicNumber`). Give each Ticket's Blockers as `blockedByPositions`: the positions, counted from 0, of earlier Tickets in the same list, so list them in dependency order. It is all or nothing: if any Ticket breaks a rule, none is created and the error names it by position (`Ticket at position 2: ...`). It returns `{ numbers }`, the new Ticket numbers in the order given.
- `create_ticket`, `update_ticket`: create and update Tickets. `create_ticket` takes the Project as `projectId` or `projectName`. `update_ticket` replaces the full description when a new description is supplied, so preserve existing content when editing it. It also takes `addLabels` and `removeLabels`, applied atomically with the other fields (removals first).
- `update_tickets`: apply the same Status, `addLabels` and/or `removeLabels` to an explicit list of at most 50 Ticket numbers. It reports `updated` and `failed` per Ticket; a result with any failure is an error, but the Tickets in `updated` were still changed.
- `list_labels`, `add_ticket_labels`, `remove_ticket_labels`: read and change Ticket labels. Reuse a label from `list_labels` when one fits. `create_ticket` also takes `labels`.
- Acceptance criteria: a Ticket's optional, ordered checklist, separate from its description; `get_ticket` returns it as `acceptanceCriteria` (each with `id`, `text` and `checked`). `create_ticket` takes an initial list. `update_ticket` with `acceptanceCriteria` replaces the whole list: give `id` to keep an existing criterion, leave it out for a new one; criteria left out are removed. `set_acceptance_criteria_checked` checks or unchecks criteria by id without touching the rest. Checking criteria never changes the Status.
- `list_comments`, `add_comment`, `edit_comment`, `remove_comment`: read and write comments on a Ticket. Comments you add are authored `agent`; you can edit or remove only those, never the User's. Removing a comment deletes it permanently.
- `list_blockers`, `add_blocker`, `remove_blocker`: read and change which Tickets block which. `add_blocker` and `remove_blocker` take `blocker` (the Ticket that must be resolved first) and `blocked` (the Ticket that waits for it). A Blocker is resolved once it is Done or archived. Every Ticket carries `blockedBy` (its Blockers' numbers) and `blocked` (whether any is unresolved); `list_tickets` with `blocked: false` finds Tickets that are ready to start.
- `archive_ticket`, `restore_ticket`: archive or restore a Ticket. Tickets cannot be deleted. An Epic cannot be archived while any child is not archived.
- Epics (ADR 0011): a Ticket created with `type: "Epic"` on `create_ticket`, fixed for good, grouping normal Tickets of its own Project, one level deep.
  - Create children with `create_ticket` or `create_tickets` and `epicNumber`; move existing Tickets in with `attach_to_epic` and out with `detach_from_epic`. A Ticket is in at most one Epic, and a grouped Ticket (a child, or an Epic with children) cannot move to another Project.
  - Its Status follows its children that are not archived (Todo with none or all Todo, Done when all are Done, In progress otherwise), and `update_ticket` refuses to set it.
  - Blockers between an Epic and its own children are refused; order the children with Blockers among themselves.
  - Claiming the Epic covers its children: no other Agent run can claim one meanwhile, and `list_tickets` with `claimed` counts them as claimed. Its Claim is released when it reaches Done.
- Cycles (ADR 0010): goal-led plans of a Project's Tickets, each `Prepared`, `Active` (at most one per Project) or `Archived` (read-only history).
  - `list_cycles`: a Project's Cycles, oldest first, each with its `state` and `ticketNumbers`.
  - `create_cycle`, `rename_cycle`: a new Cycle starts `Prepared` and empty; an `Archived` one cannot be renamed.
  - `plan_ticket`, `unplan_ticket`: put a Ticket into a Prepared or Active Cycle of its Project, or take it out. Any non-archived Ticket can be planned, `Done` ones included to record finished work, and a Ticket is in at most one Cycle that is not `Archived`. A member that becomes `Done` or is archived stays in its Cycle.
  - `list_tickets` with `cycleId`: the Tickets of one Cycle, or with `cycleId: null` the Backlog, the Tickets in no Prepared or Active Cycle.
  - `start_cycle`: make a Prepared Cycle `Active`. While another Cycle is Active it is refused; pass `confirmArchiveActive: true` only after the User agrees, which archives the Active Cycle and rolls its open, non-archived Tickets into the started one in one step.
  - `archive_cycle`: archive the Active Cycle, finished or not. Its Tickets keep their Status; its unfinished ones return to the Backlog.

Ticket Statuses are `Todo`, `In progress`, and `Done`. Move a Ticket to `In progress` when starting work and `Done` when finishing it. When completing a Ticket, remove its active triage state label (`needs-triage`, `needs-info`, `ready-for-agent`, or `ready-for-human`) in the same `update_ticket` call that sets the Status to `Done`. Preserve category labels such as `bug` and `enhancement`; do not remove `wontfix` as part of this completion rule. Refer to Tickets as `#<number>`.

## Development work in this repository

Use the existing Project named `Tandembike` for software-development work on this codebase. Pass it as `projectName: "Tandembike"`, or resolve its id with `list_projects`; do not create a second Project for repository work. Before implementation, look for a clearly matching Ticket in that Project. If the user gave a Ticket reference, fetch that Ticket and use it. If exactly one existing Ticket clearly matches, update it to `In progress` before starting. If several Tickets could match, ask which one; if none clearly matches, proceed with the user's request without creating a Ticket unless asked. Once you open the Ticket's PR (see "Git workflow" in `AGENTS.md`), post its link as a comment on the Ticket with `add_comment`. Update the relevant Ticket to `Done` only once its PR is merged into `main` with CI green, review is complete, and its acceptance criteria are checked off (see below). Until then it stays `In progress`. When work spans multiple Tickets, update each Ticket as it starts and mark each `Done` only when its work is merged and verified.

## Working an Epic

An Epic is handed off, worked and delivered as one unit:

1. `get_ticket` the Epic: its description is the shared context for every child, and `children` lists them with their Blockers. Move the Epic's own Status nowhere; it follows the children.
2. Claim the Epic once with `claim_ticket`. Leave the children unclaimed: the Epic's Claim covers them.
3. Work the children in Blocker order on one branch named after the Epic, `ticket-<epic number>-<slug>`: next is an unfinished child whose Blockers are Done, archived, or children already worked on this branch. Move each child to `In progress` as you start it, check off its acceptance criteria as you verify them, and commit it on its own, naming it (`Ticket #42`).
4. Open one PR for the whole Epic, named after it, and post its link as a comment on the Epic.
5. Once the PR is merged with CI green, move every child to `Done` in one `update_tickets` call; the Epic reaches `Done` with them, which releases its Claim. Then remove the Epic's triage state label with its own `update_ticket` call: `removeLabels` naming the label and no Status, since an Epic's Status cannot be set. Its category labels (`bug`, `enhancement`) and `wontfix` stay. This is the Epic case of the completion rule in `triage-labels.md`.

## Triage and Blockers

Record triage roles as labels: one category label (`bug` or `enhancement`) and one state label; the allowed state roles are listed in `triage-labels.md`. When moving a Ticket to a new triage state, swap the state labels in one `update_ticket` call with `removeLabels` and `addLabels` (plus any other field changes, such as the description). Post triage notes as a comment with `add_comment`, starting with `> *This was generated by AI during triage.*`; leave the description alone unless the triage changes what the Ticket asks for. Older Tickets may still have a `## Triage notes` section in the description; leave it in place. Record blocking relationships with `add_blocker`, not in the description. Older Tickets may still have a `Blocked by: #<number>` line in the description; when you touch one, add those Blockers with `add_blocker` and delete the line, preserving the rest of the description. Represent `wontfix` with the `wontfix` label and keep the Ticket active.

## Acceptance criteria

Store a Ticket's acceptance criteria in its `acceptanceCriteria` field, never as a `- [ ]` checklist in the description or in a comment. When a skill's template (such as a `to-tickets` issue or a `triage` agent brief) has an acceptance-criteria checklist, pass those items as `acceptanceCriteria` on `create_ticket` or `update_ticket` and leave that section out of the description or comment. Confirm with `get_ticket` that they were stored.

Older Tickets may still carry an acceptance-criteria checklist in the description; when you touch one, move those items into `acceptanceCriteria` (keeping their checked state) and delete the checklist, preserving the rest of the description.

While working a Ticket, check off each criterion with `set_acceptance_criteria_checked` as you verify it. Move the Ticket to `Done` only once every criterion is checked; if one is deliberately left unmet, say why in a comment first.

## When a skill says “publish to the issue tracker”

Create one Ticket per approved work item in the selected Project, using the MCP tools, with its acceptance criteria in `acceptanceCriteria`. Create them in one `create_tickets` call, in dependency order, with each dependency in `blockedByPositions`; for more than 50 items, or a dependency on an existing Ticket, use further calls and `add_blocker`.

## When a skill says “fetch the relevant ticket”

Call `get_ticket` with the Ticket number and read its full description and its `acceptanceCriteria`, the definition of done, then `list_comments` for its comments.
