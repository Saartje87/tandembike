# Issue tracker: Local Tandembike app (MCP)

This repository's Tickets live in the local Tandembike app, in the Project named `Tandembike`: use it for all work on this codebase, and do not create a second one. Reach it through its MCP server at `http://localhost:4747/api/mcp` with an MCP-capable client; the app must be running. Use its tools, not `gh`, `glab` or `.scratch/` files, even where a skill describes another tracker. The server's instructions and tool descriptions explain how the tracker works: Statuses, Claims, acceptance criteria, Blockers, Epics, Cycles and each tool's rules (ADR 0014). This document adds only this repository's process on top of them.

## When the MCP tools change

A change to `src/mcp/mcp-server.ts` reaches the running app on save under `npm run dev`, and only after `npm run build` and a restart under `npm run start`. Once it has, ask the User to start a new session to pick up the new tool descriptions and instructions. Reconnecting with `/mcp` in Claude Code is not enough: it reconnects the server, but tool descriptions this session has already loaded stay as they were. Until the new session, treat your loaded tool descriptions as out of date.

## Development work in this repository

Before implementation, look for a clearly matching Ticket in that Project. If the user gave a Ticket reference, fetch that Ticket and use it. If exactly one existing Ticket clearly matches, claim it with `claim_ticket` and update it to `In progress` before starting. If several Tickets could match, ask which one; if none clearly matches, proceed with the user's request without creating a Ticket unless asked. Once you open the Ticket's PR (see "Git workflow" in `AGENTS.md`), add its URL to the Ticket as an External reference with `update_ticket` `addExternalReferences`; do not post it as a comment. If that PR is closed and replaced, add the new PR's URL as another reference and leave the old one: references are history, not status. Update the relevant Ticket to `Done` only once its PR is merged into `main` with CI green, review is complete, and its acceptance criteria are checked off (see below); remove its triage state label in the same call, by the completion rule in `triage-labels.md`. Until then it stays `In progress`. When work spans multiple Tickets, update each Ticket as it starts and mark each `Done` only when its work is merged and verified.

A Claim covers the work of one Agent run, not the wait for a merge:

- Right after adding the PR's External reference, release the Claim with `release_ticket_claim`. The Ticket stays `In progress`; that and the PR reference show it is taken.
- A later Agent run that works on the open PR, for example to fix review findings, claims the Ticket for that work and releases it again when done.
- After the merge, the Agent run that merged the PR at the User's request moves the Ticket to `Done`. Otherwise any later run that finds an `In progress` Ticket whose PR, in its External references, is merged with CI green does; failing both, the User does.

## Worktrees for parallel runs

When Tandembike starts a run with Parallel runs on, it tells the run to work in a git worktree of its own, by this section. Follow it for any Agent run that shares the checkout with another.

- **Where.** `.claude/worktrees/<slug>/` inside the repository, which is git-ignored. `EnterWorktree` puts one there. Otherwise create it by hand off `main`, on the branch `AGENTS.md` names: `git worktree add -b ticket-<number>-<slug> .claude/worktrees/<slug> origin/main`. Create it before you change any file, and stay inside it.
- **Enter it.** Once the worktree exists, call `EnterWorktree` with its `path`; it accepts any worktree under `.claude/worktrees/` that `git worktree list` shows. From then on every command runs inside it, so write commands bare (`npm run check`, `git status`). A `cd <worktree> && …` prefix does not match the committed allowlist in `.claude/settings.json`, so each one stops for a permission prompt.
- **Prepare it.** The app keeps its database in the folder (`data/`), so a fresh worktree starts with an empty one and needs no env file. Run `npm ci --prefer-offline --no-audit --no-fund --ignore-scripts`, then `npm rebuild better-sqlite3`. Do not symlink `node_modules` (steps 2–3 of `browser-checks.md`).
- **Ports.** Port 4747 belongs to the User's running app, and your MCP tools reach Tickets through it, so never run `npm run dev` or `npm run start` in a worktree without a port: both default to 4747. To serve the app, run `npm run dev -- -p <port>` on a free port, such as 3100 and up. Use that throwaway server and its own `data/` for anything that creates or deletes Tickets, as `browser-checks.md` requires. `npm run check` needs no server. Runs that this throwaway server starts reach Tickets through port 4747 unless you set `TANDEMBIKE_MCP_URL=http://localhost:<port>/api/mcp` when you start it. To check such a run, set its throwaway Project's repository path to your own worktree, so the run works on your branch. Claude Code then writes the run's log next to your own session's, in `~/.claude/projects/<worktree path with / and . as ->/`. Find it by the run's first prompt (`grep -l 'Triage T1' <that folder>/*.jsonl`). Don't take the newest file: that is usually your own session.
- **Clean up.** After the PR is open, stop any server you started, then from the main checkout run `git worktree remove .claude/worktrees/<slug>` and `git worktree prune`. If removal refuses because of uncommitted files, commit or discard them first; do not use `--force` on work you have not pushed. Leave the branch: it is the PR's.

## Working an Epic

An Epic is handed off, worked and delivered as one unit:

1. `get_ticket` the Epic and claim it once with `claim_ticket`, as the server's instructions describe.
2. Leave the children unclaimed: the Epic's Claim covers them.
3. Work the children in Blocker order on one branch named after the Epic, `ticket-<epic number>-<slug>`: next is an unfinished child whose Blockers are Done, archived, or children already worked on this branch. Move each child to `In progress` as you start it, check off its acceptance criteria as you verify them, and commit it on its own, naming it (`T42`).
4. Open one PR for the whole Epic, named after it, and add its URL to the Epic as an External reference with `update_ticket` `addExternalReferences`, not to its children. Then release the Epic's Claim with `release_ticket_claim`, by the Claim rule in "Development work in this repository"; a later run working on the PR claims the Epic again.
5. Once the PR is merged with CI green, whoever that rule names moves every child to `Done` in one `update_tickets` call; the Epic reaches `Done` with them. Then remove the Epic's triage state label with its own `update_ticket` call: `removeLabels` naming the label and no Status, since an Epic's Status cannot be set. Its category labels (`bug`, `enhancement`) and `wontfix` stay. This is the Epic case of the completion rule in `triage-labels.md`.

## Triage and Blockers

Record triage roles as labels: one category label (`bug` or `enhancement`) and one state label; the allowed state roles are listed in `triage-labels.md`. When moving a Ticket to a new triage state, swap the state labels in one `update_ticket` call with `removeLabels` and `addLabels` (plus any other field changes, such as the description). Post triage notes as a comment with `add_comment`, starting with `> *This was generated by AI during triage.*`; leave the description alone unless the triage changes what the Ticket asks for. Older Tickets may still have a `## Triage notes` section in the description; leave it in place. Older Tickets may still have a `Blocked by: #<number>` line in the description; when you touch one, add those Blockers with `add_blocker` and delete the line, preserving the rest of the description. Represent `wontfix` with the `wontfix` label and keep the Ticket active.

## When an idea outgrows one Ticket

An idea Ticket that grilling, for example in `/triage`, shows to be a multi-session build becomes an Epic of Tickets:

1. Stop triaging it, tell the User, and continue in the same session with `/to-spec`, then `/to-tickets`.
2. `/to-spec` publishes the spec as a new Epic (`create_ticket` with `type: "Epic"`) in the idea Ticket's Project, with the spec as its description, the idea Ticket as its `originNumber` and the `ready-for-agent` label. The idea Ticket itself cannot become the Epic: a Ticket's type is fixed at creation.
3. `/to-tickets` creates the Epic's children in one `create_tickets` call with its `epicNumber` and their Blockers in `blockedByPositions`, each labelled `ready-for-agent`. "Working an Epic" then applies.
4. Comment `Refined into Epic T<number>` on the idea Ticket, remove its triage state label, and archive it with `archive_ticket`. Keep it out of the Epic: an Epic's Status follows its children, so a finished idea child would show the Epic `In progress` before any work starts.

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
