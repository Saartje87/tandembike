# MCP tools follow the work, not the data model

Decided on 2026-11-09 (T1194, phase 8 of [`software-factory-2.md`](../roadmap/software-factory-2.md)). Amends [ADR 0014](0014-server-explains-tracker.md): the server still explains the tracker in its instructions and tool descriptions, under the same cap, but the tools it describes are now these.

Amended (T1378): Agents may rename a Prepared Cycle with `update_cycle`. A Prepared Cycle is the Agent's own proposal, and its title is its goal, which planning may sharpen. Renaming an Active or an Archived Cycle stays with the User, as do starting and archiving one.

The 42 tools mirrored the tables: starting a Ticket took `claim_ticket`, `update_ticket`, `get_ticket` and `list_comments`; finding ready work took a five-filter `list_tickets` call every skill copied; giving up took `release_ticket_claim` and a Status change the Agent had to remember. Each run spent context on tracker mechanics, an Agent that got one step wrong left a Ticket Stalled, and the fine-grained tools let Agents do things that are the User's to decide.

## The tool set

Fifteen tools replace the 42, in one change, with no compatibility layer. Each does one step of the work and returns what the next step needs.

- **Work:** `next_work` (the top Eligible-shaped item of the Active Cycle, or why there is none), `start_work` (claim, Todo to In progress, and the whole bundle: Ticket, comments, Blockers, Epic, Cycle, Check command), `add_note`, `check_criterion`, `open_pr` (`handOff: true` also releases the Claim), `finish_work` (the completion rule), `abandon_work` (comment, release, back to Todo unless a PR exists).
- **Tickets:** `file_tickets`, `find_tickets`, `get_ticket` (with comments; `include: ["activity"]`), `update_ticket` (one or several numbers; every field, Blockers, Epic, Cycle and archive state), `attach`, `read_attachment`.
- **Project:** `get_project` (Cycles and labels in use; `allProjects`), `create_cycle` (a Prepared Cycle with Tickets planned in) and `update_cycle` (renames a Prepared Cycle, T1378).
- **Spar** (added by T1306, ADR 0046): `get_canvas`, `edit_canvas`, `update_write_up` (T1307) and `propose_hand_off` (T1308) read and change the Canvas, Write-up and Hand-off draft of the calling run's own Spar, found through `X-Tandembike-Run`, and are refused in any other run. They are the only tools a Spar run may use that write; `propose_hand_off` only drafts, and the User's approval, a Server Action, files the Ticket.
- **Conversations** (added by T1265): `get_conversations`, read-only, lists a Ticket's Conversations and pages through one transcript, newest first, with text trimmed unless `full`. It reads them through `createConversationReader`, not the live Conversations module, and shows no cost or Run outcome; starting, replying to and stopping a run stay the User's.

Every refusal keeps today's message: the rules live in the Tickets module and the tools only route to them.

## What moved to the UI, and why

Starting and archiving a Cycle, ordering a Lane, renaming a Project or an Active or Archived Cycle, creating a Project, and editing or removing comments and Attachments are no longer MCP tools. They are the User's gates: the Cycle gate (what the team commits to), the order the User ranks work in, and what the User wrote or attached. The UI's Server Actions keep full power. Agents propose (`create_cycle` makes a Prepared Cycle, `update_cycle` renames it); the User decides. A release by itself is no longer a tool: `abandon_work` and `open_pr` with `handOff` release a Claim together with the Status change that goes with it.

## The run-ID header

The Conversations module sends `X-Tandembike-Run: <Agent-run ID>` next to the cwd header, as a literal value (the SDK expands `${VAR}` against its own process, as for the cwd header in ADR 0036). `handleMcpRequest` passes it to the tools as the default `agentRunId`; an explicit `agentRunId` wins. A tool that needs a run and gets neither is refused: "Pass agentRunId, a unique ID for this Agent run." A terminal session passes it itself.

## The guard test

`src/mcp/removed-tools.test.ts` lists the removed names and fails, naming file and line, when one appears in `.agents/skills`, `docs/agents`, `AGENTS.md`, `CLAUDE.md` or the sources of the run brief and Retro prompt. ADRs, research notes and roadmaps are exempt as history. It is tested against a planted name in a temporary copy. Another test keeps every tool description and the instructions under 3,500 characters, below Claude Code's cut at 4,096 (T645).

## Consequences

- A client keeps the tool list it connected with: after the merge the User must start new Claude Code sessions.
- Phase 9's Playbook skills and phase 11's `propose_triage` (and `create_cycle`, which Plan uses in place of a `propose_cycle`) are written against this set.
- A change to the tool set updates the guard test's list, the snapshot in `src/mcp/__snapshots__/` and this record in the same change.
