# Issue tracker: Local Tandembike app (MCP)

This repository's Tickets live in the local Tandembike app, in the Project named `Tandembike` (id 3, so its pages are under `http://localhost:4747/project/3`): use it for all work on this codebase, and do not create a second one. Ticket summaries carry no Project id; `get_ticket` returns it as `projectId`. Reach it through its MCP server at `http://localhost:4747/api/mcp` with an MCP-capable client; the app must be running. Use its tools, not `gh`, `glab` or `.scratch/` files, even where a skill describes another tracker. The server's instructions and tool descriptions explain how the tracker works: Statuses, Claims, acceptance criteria, Blockers, Epics, Cycles and each tool's rules (ADR 0014). This document adds only this repository's process on top of them.

## When the MCP tools change

A change to `src/mcp/mcp-server.ts` reaches the running app on save under `npm run dev`, and only after `npm run build` and a restart under `npm run start`. Once it has, ask the User to start a new session to pick up the new tool descriptions and instructions. Reconnecting with `/mcp` in Claude Code is not enough: it reconnects the server, but tool descriptions this session has already loaded stay as they were. Until the new session, treat your loaded tool descriptions as out of date.

## Development work in this repository

Before implementation, look for a clearly matching Ticket in that Project. If the user gave a Ticket reference, fetch that Ticket and use it. Ready work for an Agent is `list_tickets` with `status: "Todo", labels: ["ready-for-agent"], blocked: false, claimed: false`: the Board's Queued Lane holds only `ready-for-agent` Tickets, and other Todo Tickets sit in Intake or Your work. If exactly one existing Ticket clearly matches, claim it with `claim_ticket` and update it to `In progress` before starting. If several Tickets could match, ask which one; if none clearly matches, proceed with the user's request without creating a Ticket unless asked. Once you open the Ticket's PR (see "Git workflow" in `AGENTS.md`), add its URL to the Ticket as an External reference with `update_ticket` `addExternalReferences`; do not post it as a comment. If that PR is closed and replaced, add the new PR's URL as another reference and leave the old one: references are history, not status. Update the relevant Ticket to `Done` only once its PR is merged into `main` with CI green, review is complete, and its acceptance criteria are checked off (see below), with `complete_ticket`, which applies the completion rule in `triage-labels.md`. Until then it stays `In progress`. When work spans multiple Tickets, update each Ticket as it starts and mark each `Done` only when its work is merged and verified.

A Claim covers the work of one Agent run, through its merge:

- The run that opens the PR waits for CI (`gh pr checks <number> --watch`). Green: it merges the PR with `gh pr merge <number> --merge` and calls `complete_ticket`, which also releases the Claim. Red: it fixes the branch and waits again, or, when it cannot, comments on the Ticket why the PR stays open and releases the Claim with `release_ticket_claim`. The Ticket then stays `In progress`; that and the PR reference show it is taken.
- A later Agent run that works on the open PR, for example to fix review findings, claims the Ticket for that work and releases it again when done.
- After the merge, the Agent run that merged the PR moves the Ticket to `Done`. Otherwise any later run that finds an `In progress` Ticket whose PR, in its External references, is merged with CI green does; failing both, the User does, with the **Merged** button on the Ticket's Review card on the Board. An Agent run does it with `complete_ticket`: it and the Merged button both apply the completion rule through the Tickets module's `completeTicket`, and neither checks anything on GitHub, so check the merge, CI and acceptance criteria first.
- Abandoning the work without a PR? Releasing the Claim of an `In progress` Ticket with no PR reference leaves it stalled in the Action needed section of the Board's In progress Lane, so also move it back to `Todo` with `update_ticket`, or say in a comment why it stays `In progress`.

Board Lanes (Intake, Queued, In progress, Your work, Done) and the In progress sections (Action needed, Running, Review) are derived in the UI and stay out of the MCP tools (ADR 0023): no tool returns or filters by a Lane. `sort_lane` sets a Status's Board order, which a Lane shows filtered by labels.

To see a Project's structure, start from the `list_tickets` summaries: each row has `epicNumber`, the Epic the Ticket is a child of, or `null`. When you need more than a summary, such as each Ticket's criteria or Claim, pass `detail: "full"` with `description: false`. A full list with descriptions can grow too big for the client to return.

## Worktrees for parallel runs

When Tandembike starts a run with Parallel runs on, it tells the run to work in a git worktree of its own, by this section. Follow it for any Agent run that shares the checkout with another.

- **Where.** `.claude/worktrees/<slug>/` inside the repository, which is git-ignored. `EnterWorktree` puts one there. Otherwise create it by hand off `main` (or off the integration branch, for an `implement-spec` implementer), on the branch `AGENTS.md` names: `git worktree add --no-track -b ticket-<number>-<slug> .claude/worktrees/<slug> origin/main`. Keep `--no-track` whenever the start point is a remote branch: tracking writes the shared `.git/config`, and runs that start at the same moment collide on its lock. You set the upstream later with `git push -u`. Create it before you change any file, and stay inside it.
- **Recover.** If `git worktree add` fails with `could not lock config file .git/config`, it may have created the branch but not the worktree. Then attach the existing branch without `-b`: `git worktree add .claude/worktrees/<slug> ticket-<number>-<slug>`.
- **Enter it.** Once the worktree exists, call `EnterWorktree` with its `path`; it accepts any worktree under `.claude/worktrees/` that `git worktree list` shows. From then on every command runs inside it, so write commands bare (`npm run check`, `git status`). A `cd <worktree> && …` prefix does not match the committed allowlist in `.claude/settings.json`, so each one stops for a permission prompt.
- **Prepare it.** The app keeps its database in the folder (`data/`), so a fresh worktree starts with an empty one and needs no env file. Run `npm ci --prefer-offline --no-audit --no-fund --ignore-scripts`, then `npm rebuild better-sqlite3`. Do not symlink `node_modules` (steps 2–3 of `browser-checks.md`).
- **Ports.** Port 4747 belongs to the User's running app, and your MCP tools reach Tickets through it, so never run `npm run dev` or `npm run start` in a worktree without a port: both default to 4747. To serve the app, run `npm run dev -- -p <port>` on a free port, such as 3100 and up. Use that throwaway server and its own `data/` for anything that creates or deletes Tickets, as `browser-checks.md` requires. `npm run check` needs no server. Runs that this throwaway server starts reach Tickets through port 4747 unless you set `TANDEMBIKE_MCP_URL=http://localhost:<port>/api/mcp` when you start it. To check such a run, set its throwaway Project's repository path to your own worktree, so the run works on your branch. Claude Code then writes the run's log next to your own session's, in `~/.claude/projects/<worktree path with / and . as ->/`. Find it by the run's first prompt (`grep -l 'Triage T1' <that folder>/*.jsonl`). Don't take the newest file: that is usually your own session.
- **Clean up.** After the PR is open, stop any server you started, then from the main checkout run `git worktree remove .claude/worktrees/<slug>` and `git worktree prune`. If removal refuses because of uncommitted files, commit or discard them first; do not use `--force` on work you have not pushed. Leave the branch: it is the PR's.

## Working an Epic

An Epic is handed off, worked and delivered as one unit:

1. `get_ticket` the Epic and claim it once with `claim_ticket`, as the server's instructions describe.
2. Leave the children unclaimed: the Epic's Claim covers them.
3. Work the children in Blocker order on one branch named after the Epic, `ticket-<epic number>-<slug>`: next is an unfinished child whose Blockers are Done, archived, or children already worked on this branch. Move each child to `In progress` as you start it, check off its acceptance criteria as you verify them, and commit it on its own, naming it (`T42`).
4. Open one PR for the whole Epic, named after it, and add its URL to the Epic as an External reference with `update_ticket` `addExternalReferences`, not to its children. Then merge it or release the Epic's Claim, by the Claim rule in "Development work in this repository"; a later run working on an open PR claims the Epic again.
5. Once the PR is merged with CI green, whoever that rule names calls `complete_ticket` on the Epic: in one transaction it completes every unarchived child, removes the Epic's own triage state label and releases its Claim; the Epic reaches `Done` with its children. Its category labels (`bug`, `enhancement`) and `wontfix` stay. This is the Epic case of the completion rule in `triage-labels.md`, and what the User's **Merged** button does.

## Feedback as Tickets

Friction you hit while working a Ticket becomes a Ticket, because a reply nobody reads loses it: the Blocks and process feedback rules in `AGENTS.md` point here. File the Tickets at the end of the task, before you release your Claim or end the Conversation; nothing you learned survives it.

1. Check each claim against the installed types or the docs first.
2. Pick the Project the item is about: `@blockle/blocks` for Blocks friction, `Tandembike` for process and tooling friction.
3. Search that Project with `list_tickets` (a `query`, `includeArchived: true`). When a Ticket already covers the item, add a comment with the new repro and the workaround you used, and stop.
4. Otherwise create one Ticket per item in that Project, outside any Cycle or Epic. Its description has Problem, Repro, Expected, Workaround and Question sections; its acceptance criteria are taken from Expected. Labels: `needs-triage`, `bug` (a defect in existing behaviour) or `enhancement`, and a source label: `from:tandembike` for Blocks Tickets, `from:agent-run` for process Tickets.
5. Make its first comment "Found while working T<number>", naming the Ticket you were on.
6. Close your final message with one line per Ticket you filed or commented on, as a pointer to it, and nothing when there was none.

The factory leaves these Tickets alone, and only the User decides to label one `ready-for-agent`.

## Triage and Blockers

Record triage roles as labels: one category label (`bug` or `enhancement`) and one state label; the allowed state roles are listed in `triage-labels.md`. When moving a Ticket to a new triage state, swap the state labels in one `update_ticket` call with `removeLabels` and `addLabels` (plus any other field changes, such as the description). Post triage notes as a comment with `add_comment`, starting with `> *This was generated by AI during triage.*`; leave the description alone unless the triage changes what the Ticket asks for. Older Tickets may still have a `## Triage notes` section in the description; leave it in place. Older Tickets may still have a `Blocked by: #<number>` line in the description; when you touch one, add those Blockers with `add_blocker` and delete the line, preserving the rest of the description. Represent `wontfix` with the `wontfix` label and keep the Ticket active.

## Publishing a spec

A spec is always an Epic in Tandembike, whatever its size, so that its build Tickets hang off it and "Working an Epic" applies. `/to-spec` publishes it with `create_ticket` (`type: "Epic"`) in the work's Project, with the spec as its description and the `ready-for-agent` label; `/to-tickets` then creates its children in one `create_tickets` call with its `epicNumber` and their Blockers in `blockedByPositions`, each labelled `ready-for-agent`. A spec of one Ticket's worth is an Epic with one child.

When the spec refines an idea Ticket, for example one grilled in `/triage`:

1. Stop triaging it, tell the User, and continue in the same session with `/to-spec`, then `/to-tickets`.
2. Publish the Epic with the idea Ticket as its `originNumber`. The idea Ticket itself cannot become the Epic: a Ticket's type is fixed at creation.
3. Comment `Refined into Epic T<number>` on the idea Ticket, remove its triage state label, and archive it with `archive_ticket`. Keep it out of the Epic: an Epic's Status follows its children, so a finished idea child would show the Epic `In progress` before any work starts.

When the Ticket being triaged is already an Epic with no children, such as a follow-up an earlier spec filed as an Epic, it becomes the spec itself: replace its description with the spec, create its children under it with `/to-tickets`, and swap its triage state label for `ready-for-agent`. Do not publish a new Epic or archive it.

When the spec is feedback on an Epic that is already built or in review, such as follow-up requests after its PR, publish a new Epic with the existing Epic as its `originNumber`, and leave the existing Epic unchanged: no comment, no archive. Its new branch starts from the existing Epic's branch, and its PR targets that branch while the earlier PR is open.

## Acceptance criteria

When a skill's template (such as a `to-tickets` issue or a `triage` agent brief) has an acceptance-criteria checklist, pass those items as `acceptanceCriteria` on `create_ticket` or `update_ticket` and leave that section out of the description or comment. Confirm with `get_ticket` that they were stored.

Older Tickets may still carry an acceptance-criteria checklist in the description; when you touch one, move those items into `acceptanceCriteria` (keeping their checked state) and delete the checklist, preserving the rest of the description.

Move a Ticket to `Done` only once every criterion is checked; if one is deliberately left unmet, say why in a comment first.

## When a skill says “publish to the issue tracker”

Create one Ticket per approved work item in the selected Project, using the MCP tools, with its acceptance criteria in `acceptanceCriteria`. Create them in one `create_tickets` call, in dependency order, with each dependency in `blockedByPositions`; for more than 50 items, or a dependency on an existing Ticket, use further calls and `add_blocker`. To name a sibling in a title, description or criterion, write `{{T:n}}` (n its position in the call, from 0) instead of guessing its number.

When the items are split from an existing Ticket that is not an Epic, such as a spec, pass that Ticket as `originNumber` so they form its Origin group (ADR 0015). Then move the split Ticket to `Done`, removing its triage state label, and do not archive it: its drawer lists the split-off Tickets and stays on the Board as the group's view. Each split-off Ticket is then worked on its own, by "Development work in this repository".

## When a skill says “fetch the relevant ticket”

Call `get_ticket` with the Ticket number and read its full description and its `acceptanceCriteria`, the definition of done, then `list_comments` for its comments.
