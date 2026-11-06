# Roadmap: Tandembike as a local software factory

Status: agreed on 2026-11-06 in a grilling session (T1058). Each phase is specced into an Epic with `/to-spec` and `/to-tickets` when its turn comes, with T1058 as the Origin. Decisions here can be revisited; when one changes, update this file in the same PR.

## Goal

The User plans a Cycle. While the Cycle is Active, Tandembike works every `ready-for-agent` Ticket and Epic in it without the User pressing Allow all day, shows on the Board what each run is doing and where it needs the User, and leaves the User one job: review and merge. Runs file what they learn about the process as Tickets for the User to triage.

Working title: software factory. In the Glossary and UI the feature is **Autopilot**.

## Vocabulary

Existing terms keep their meaning: Ticket, Epic, Cycle, Board, Lane, Status, Label, Conversation, Claim, External reference, Agent command. New terms this roadmap introduces, to be added to `GLOSSARY.md` by the phase that builds them:

- **Autopilot**: a Project switch. While it is on and the Project has an Active Cycle, Tandembike starts Start Conversations for the Cycle's eligible work.
- **Eligible**: a Ticket or Epic in the Active Cycle, Status Todo, labelled `ready-for-agent`, with no unresolved Blocker, unclaimed and not archived. An Epic is eligible by its own label and is dispatched as one unit; a child is never dispatched on its own.
- **Agent run mode**: a Project setting, `default` or `auto`, that every run the Project starts is pinned to.
- **Started by**: who started a Conversation, the User or Autopilot. Recorded on the Conversation and shown in its header.
- **Lane** (revised): a Board section that holds the Tickets in one situation, in their order. Lanes are derived from Status, triage labels and run state; Status stays the fixed set Todo, In progress, Done.
- **Status line**: one line on an In progress card saying what its live Conversation is doing now.
- **Stalled**: an In progress Ticket with no Claim and no PR in its External references, such as one whose Conversation the User closed.

## Decisions

Reached in the grilling session. Each is "why" as much as "what"; the phase that builds it writes the ADR.

### Where the factory lives

Inside Tandembike, as a dispatcher that starts ordinary Start Conversations. Runs, the permission relay, transcripts, Claims and live updates already exist there (ADR 0019), and runs may only start through Server Actions. Rejected: an external loop (a `/loop` session or script polling the MCP), which would re-implement the relay or run with permissions bypassed.

### Board lanes are derived, Status stays fixed

Five Lanes over the three Statuses:

| Lane        | Holds                                                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intake      | Todo with `needs-triage`, `needs-info`, or no triage state label                                                                                                                                                                                                    |
| Todo        | Todo with `ready-for-agent`: the Autopilot queue, in lane order                                                                                                                                                                                                     |
| In progress | In progress, in three sections: **Action needed** (its live Conversation waits on a permission or a question, failed, or was interrupted; or the Ticket is stalled), **Running** (claimed, no PR yet), **Review** (a PR in its External references, Claim released) |
| For human   | Todo with `ready-for-human`: work the User implements                                                                                                                                                                                                               |
| Done        | Done                                                                                                                                                                                                                                                                |

Rejected: new Statuses. They would change the MCP enum, every Agent's `status: "Todo"` filter, Stats, Cycle rollover and the ready-work rule, and a Ticket dropped into Review with no PR would mean nothing.

Drag changes Status only, as today. Lanes that share a Status (Intake, Todo, For human) are not drop targets for each other, and the In progress sections accept no drops. Rejected: triage by drag (a drop swapping labels).

Epics stay listed apart from the Lanes, as today, with a state badge (Action needed, Review) and the Merged button on the Epic card. The Project Board and the Cycle Board use the same Lanes; an empty Lane collapses.

"For human" means `ready-for-human`, work the User does; it is not "needs the User now", which is the Action needed section.

### Status line on In progress cards

Derived from the latest transcript entry of the Ticket's live Conversation (`running` or `waiting`, newest first) by a pure function: a tool entry reads "Reading src/x.tsx", "Editing …", "Running npm run check", "Searching …", "Updating T42"; an agent text entry gives its first sentence; `waiting` shows the question or the permission rule in a few words; `interrupted` and errors say why. Tool names are humanised by an explicit mapping (Read, Edit, Write, Bash with its description, Grep, Glob, Skill, Agent, the Tandembike tools by verb); an unmapped tool shows its bare name and first input value. Elapsed time counts from the run's start (the User's latest message in the Conversation) and ticks client-side once a minute. Shown on Ticket cards in the In progress Lane and on Epic cards, nowhere else. No partial-message streaming, no new SDK plumbing: the runner already stores every tool call and agent text as a transcript entry and the events route announces each.

### The User merges; Done is one click

The User stays the merge gate and merges on GitHub. The factory never merges, never runs `gh`, and makes no network calls. Agents already add their PR URL to the Ticket, or the Epic, as an External reference. A **Merged** button on Review cards and Epic cards applies the completion rule from `docs/agents/issue-tracker.md`: Status Done, triage state label removed, Claim released; for an Epic, every child in one call and the Epic's own label removed. It trusts the User and checks nothing. The Board shows the PR link, not CI status; the User sees that on GitHub. Rejected: auto-merge on CI green; polling PR state with `gh` from Tandembike; a merge button running `gh pr merge`; a scheduled "finish" Agent run that checks PRs. The existing fallback stays: a later Agent run that finds an In progress Ticket whose PR is merged may move it to Done.

A stalled Ticket shows in Action needed with a **Back to Todo** action. Autopilot never treats a stalled Ticket as eligible: an In progress Ticket without a Claim may be one the User works on in a terminal.

### Autopilot dispatch

- A per-Project switch, off by default, on the Board header and in the Project settings. It persists, so it survives a server restart. Starting a Cycle does not flip it on. Turning it off pauses new dispatches and does not stop running runs.
- Continuous while on: immediately on `start_cycle`, and again whenever something becomes eligible (a Ticket planned in mid-Cycle, a Blocker reaching Done, a run slot freeing up). Rejected: one-shot dispatch at Cycle start, which strands Blockers; a manual "run once" button.
- Fills the free slots under the existing parallel runs cap (`parallelRuns` and `maxConcurrentRuns`), in the Cycle Board's Todo lane order, so `sort_lane` is the priority mechanism. No extra budget or per-Cycle cap in version one. Parallel runs off gives a serial factory.
- Starts the same Start Conversation the Start button does, with the Project's Start command or Start command for Epics, and the same brief. The Conversation records Started by Autopilot; the Glossary's "only the User starts a Conversation" and ADR 0019 are revised for the second starter. Rejected: a new intent with its own brief.
- Event-driven inside the one server process (ADR 0002): re-evaluates on Ticket changes, Cycle start, run end, the switch flip and server startup, through one serialised evaluate step so double dispatch is impossible. Rejected: cron, a separate daemon.
- When a Cycle is archived or rolled over, dispatch stops because nothing is eligible; running runs finish their PRs; dispatch resumes when the next Cycle starts.
- No automatic retries. A failed, interrupted or questioning run leaves its Ticket where it is and shows in Action needed; the User resumes or closes the Conversation. Closing releases the Claim; the Ticket is then stalled until the User sends it Back to Todo.
- Autopilot leaves `needs-triage` alone, including the Tickets Agents file. The only path into the factory is the User labelling `ready-for-agent` and planning into the Cycle. Auto-triage can be a later switch.
- Per Project only; no global cap across Projects in version one.

### Agent run mode

The permission relay (ADR 0021) idles a run until the User answers every unlisted call, so a factory is only as hands-off as the repository's allowlist. The User does not want to press Allow constantly. The installed Claude Agent SDK offers `permissionMode: 'auto'`, where a classifier allows safe calls and escalates the rest. Agent run mode becomes a per-Project setting, `default` (today's behaviour) or `auto`, applied to every run the Project starts, factory or by hand; existing Projects keep `default`, Setup suggests `auto` for a factory Project. ADR 0021 noted that whether auto-mode escalations reach the relay through `canUseTool` is unverified: phase 0 verifies it. If they do not, the fallback is `acceptEdits` plus the allowlist. `bypassPermissions` stays off the table: runs start in the main checkout before moving to a worktree. Rejected: a factory-only mode; a hard-coded switch to `auto`.

### Feedback as Tickets

The "Blocks feedback" and "Process feedback" rules in `AGENTS.md` end in a reply section nobody reads in a factory. Both become Tickets, by a new section in `docs/agents/issue-tracker.md` that both rules point to and that the `implement` skill's hand-off step calls: one Ticket per item (Problem, Repro, Expected, Workaround, Question), in the Project it is about (`@blockle/blocks` for Blocks, `Tandembike` for process and tooling), outside any Cycle or Epic, labelled `needs-triage` plus a source label (`from:tandembike` for Blocks Tickets as today, `from:agent-run` for process Tickets), with "Found while working T42" as its first comment. The factory never acts on them; `ready-for-agent` stays the User's decision.

### Cycle end

When every Ticket in the Active Cycle is Done, dispatch stops and the Cycle Board shows a banner offering, not performing, two things: archive the Cycle, and start a Retro Conversation (the `retro` skill) that files improvement Tickets by the feedback rule. Archiving is a planning event the User owns (ADR 0010).

### Independent Review stage

Later and off by default: each factory PR gets a separate review run in a fresh Conversation (intent Review) running `code-review` on the branch and posting findings, before the Ticket counts as Review. A fresh run reviews without being anchored on its own work. Measure first whether the `implement` skill's inline review is enough.

## Phases

### Phase 0: auto-mode spike

Goal: know whether `auto` mode is usable before building on it.

- Start one Start run through the runner with `permissionMode: 'auto'` on a throwaway Project and a small Ticket.
- Record which calls were allowed silently, which escalated through `canUseTool` to the relay, whether the User saw them in the Conversation, and whether the run completed the Ticket to an open PR.
- Write the findings up in `docs/research/` (the `research` skill's home) and decide: `auto`, or `acceptEdits` plus allowlist.

Deliverable: the findings file and the decision recorded in this roadmap.

### Phase 1: Board lanes

Goal: a Board that shows the factory's state before any dispatcher exists. Useful today for runs the User starts by hand.

- Five derived Lanes with the In progress sections; same Lanes on Project and Cycle Boards; empty Lanes collapse; drag unchanged.
- Epic cards gain the state badge.
- Status line on In progress cards and Epic cards, with elapsed time.
- Merged button on Review cards and Epic cards; Back to Todo on stalled cards.
- The Board loads each Ticket's live Conversation state and latest transcript entry, and updates them over the events route.

Decision records: ADR "Lanes are derived from Status, labels and run state"; Glossary: Lane revised, Status line, Stalled, For human.

### Phase 2: Autopilot

Goal: the first hands-off Cycle.

- Agent run mode setting, per Project, with the runner honouring it.
- Autopilot switch, stored per Project, on the Board header and settings.
- The dispatcher: eligibility query, lane-order selection, slot accounting against the existing cap, one serialised evaluate step, triggered by events and on startup.
- Conversations record Started by; the header shows it.
- Action needed badge count on the Board header.

Decision records: ADR "Autopilot dispatches the Active Cycle's ready work"; ADR "Agent run mode is a Project setting" superseding ADR 0021's pinned `default`; ADR 0019 amended for the second starter; Glossary: Autopilot, Eligible, Agent run mode, Started by.

### Phase 3: feedback as Tickets

Goal: nothing a run learns is lost in a reply.

- New section in `docs/agents/issue-tracker.md`; `AGENTS.md` feedback rules shortened to point at it; `implement` skill's hand-off step calls it.
- Labels `from:agent-run` introduced; `from:tandembike` kept for Blocks.

Docs and skills only, no app change.

### Phase 4: Cycle end

Goal: a Cycle closes on purpose.

- Cycle Board banner when every Ticket is Done: archive the Cycle; start a Retro Conversation.
- Retro intent, or the `retro` skill as the Project's command, whichever the brief needs.

Decision records: ADR 0010 consequence noted; Glossary: Retro if it becomes an intent.

### Phase 5: independent Review stage

Goal: a second pair of eyes on every PR without the User reading every diff.

- Review intent and command setting; a Review run per PR before the Ticket counts as Review; findings posted as a PR review or Ticket comment.
- Off by default per Project.

Decision records: ADR "Review runs are separate Conversations"; Glossary: Review.

## Risks and open questions

- **Auto mode and the relay.** Unverified whether `auto` escalations reach `canUseTool`. Phase 0 answers it; the fallback is decided above.
- **Auto mode's judgement.** The classifier decides what is safe; a run in `auto` may do things the User would have denied. Worktrees and the local allowlist limit the blast radius; the User's repositories are not all trusted equally, so the setting is per Project.
- **Merge is on the critical path.** A Blocker only clears at Done, which needs the User's merge. A Cycle with a long Blocker chain runs at the User's merging pace. The Merged button makes it one click; a chained-branch mode (dependant branches off the open PR) is a possible later addition and is not planned.
- **Stalled detection.** "No Claim and no PR" is a heuristic; a terminal session without a Claim looks stalled. The Back to Todo action is manual for this reason.
- **Status line quality.** Tool-name mapping needs maintaining as skills and tools change; an unmapped tool degrades to its bare name, never to nothing.
- **Dispatcher correctness.** Double dispatch, dispatch after the switch is off, and dispatch across a server restart are the cases the tests must cover, through the public Conversations and Tickets modules.
- **Token cost.** No budget cap in version one. The run cap bounds concurrency, not spend; a per-Cycle budget is a one-line addition if needed.
- **Brief staleness.** ADR 0019 revisits the brief after about 20 Start runs. Autopilot will hit that quickly; watch transcripts for an Agent deciding badly for lack of Epic or Cycle context.
