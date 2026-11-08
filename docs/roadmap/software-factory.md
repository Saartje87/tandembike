# Roadmap: Tandembike as a local software factory

Status: agreed on 2026-11-06 in a grilling session (T1058); amended on 2026-11-07 after a review of the roadmap, grilled in the same way, which closed the gaps marked "(2026-11-07)" below; amended again on 2026-11-07 with the one-column Board (Epic T1102), grilled and prototyped (T1103). Each phase is specced into an Epic with `/to-spec` and `/to-tickets` when its turn comes, with T1058 as the Origin. Decisions here can be revisited; when one changes, update this file in the same PR.

## Goal

The User plans a Cycle. While the Cycle is Active, Tandembike works every `ready-for-agent` Ticket and Epic in it without the User pressing Allow all day, shows on the Board what each run is doing and where it needs the User, and leaves the User one job: review and merge. Runs file what they learn about the process as Tickets for the User to triage.

Working title: software factory. In the Glossary and UI the feature is **Autopilot**.

## Vocabulary

Existing terms keep their meaning: Ticket, Epic, Cycle, Board, Lane, Status, Label, Conversation, Claim, External reference, Agent command. New terms this roadmap introduces, to be added to `GLOSSARY.md` by the phase that builds them:

- **Autopilot**: a Project switch. While it is on and the Project has an Active Cycle, Tandembike starts Start Conversations for the Cycle's eligible work.
- **Eligible**: a Ticket or Epic in the Active Cycle, Status Todo, labelled `ready-for-agent`, with no unresolved Blocker, unclaimed and not archived. An Epic is eligible by its own label, once it has at least one child (2026-11-07: an Epic with no children is Todo, and the spec flow creates the Epic before its children), and is dispatched as one unit; a child is never dispatched on its own.
- **Agent run mode**: a Project setting, `default` or `auto`, that every run the Project starts is pinned to.
- **Started by**: who started a Conversation, the User or Autopilot. Recorded on the Conversation and shown in its header.
- **Spend ceiling** (2026-11-07): a Project setting in dollars that bounds what Autopilot spends in one Cycle. Autopilot cannot be turned on without one.
- **Lane** (revised): a Board section that holds the Tickets in one situation, in their order. Lanes are derived from Status, triage labels and run state; Status stays the fixed set Todo, In progress, Done.
- **Status line**: one line on an In progress card saying what its live Conversation is doing now.
- **Stalled**: an In progress Ticket with no Claim and no PR in its External references, such as one whose Conversation the User closed. An Epic is stalled the same way: no live Conversation, no PR and a released Claim.

## Decisions

Reached in the grilling session. Each is "why" as much as "what"; the phase that builds it writes the ADR.

### Where the factory lives

Inside Tandembike, as a dispatcher that starts ordinary Start Conversations. Runs, the permission relay, transcripts, Claims and live updates already exist there (ADR 0019), and runs may only start through Server Actions. Rejected: an external loop (a `/loop` session or script polling the MCP), which would re-implement the relay or run with permissions bypassed.

### Board lanes are derived, Status stays fixed

Five Lanes over the three Statuses:

| Lane        | Holds                                                                                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Intake      | Todo with `needs-triage`, `needs-info`, or no triage state label                                                                                                                                                                                                                                                               |
| Queued      | Todo with `ready-for-agent`, in lane order: on the Cycle Board the Autopilot queue; on the Project Board also the Backlog's ready work, which is not eligible until planned                                                                                                                                                    |
| In progress | In progress, in three sections: **Action needed** (its live Conversation waits on a permission or a question, failed, was interrupted, or is idle while the Ticket has no PR or still holds a Claim; or the Ticket is stalled), **Running** (claimed, no PR yet), **Review** (a PR in its External references, Claim released) |
| Your work   | Todo with `ready-for-human`: work the User implements                                                                                                                                                                                                                                                                          |
| Done        | Done                                                                                                                                                                                                                                                                                                                           |

Rejected: new Statuses. They would change the MCP enum, every Agent's `status: "Todo"` filter, Stats, Cycle rollover and the ready-work rule, and a Ticket dropped into Review with no PR would mean nothing.

(Superseded by ADR 0024: a drag now only reorders.) Drag changes Status only, as today. Lanes that share a Status (Intake, Queued, Your work) are not drop targets for each other, and the In progress sections accept no drops. Rejected: triage by drag (a drop swapping labels).

Epics stay listed apart from the Lanes, as today, with a state badge (Action needed, Review) and the Merged button on the Epic card. The Project Board and the Cycle Board use the same Lanes; an empty Lane collapses.

Children of a Todo Epic that carry `ready-for-agent` stay in the Queued lane, marked with the Epic's colour as today, and are dispatched only with their Epic: the queue is Epics plus Tickets outside any Epic (2026-11-07). The lane still answers what is planned; no UI change.

**Idle runs need the User** (2026-11-07). An `idle` Conversation is one whose Agent ended its turn: after opening the PR, or because it stopped to explain something, such as a call the auto-mode classifier refused (phase 0). The header already counts `idle` as needing the User (T593), and the Lanes do the same: `idle` puts the card in Action needed unless the Ticket has a PR reference and no Claim, which is Review. Without this rule such a card fell through to Claim and no PR, which is Running, and looked like it was working indefinitely. Built in T1065.

"Your work" (formerly "For human") means `ready-for-human`, work the User does; it is not "needs the User now", which is the Action needed section.

### The Board is one column (2026-11-07)

Five Lanes over three Statuses, with three sections in In progress, made the Board hard to read: what needs the User was spread over Action needed, Review, Intake and Epic badges, and the Cycle's progress over seven groups. A grilling session and a prototype (T1103) settled a one-column layout, first as a **Cockpit** tab beside the Board (Epic T1102). The User approved it, and Epic T1111 made it the Board itself: every Board (the Active Cycle's, each Prepared Cycle's, the Backlog's) is one column, the Cockpit tab is gone and "Cockpit" is on the _Avoid_ list (ADR 0024). Todo is renamed Queued and For human Your work.

- It is ordered by what needs the User: **Needs you** (Action needed, then Review, then Intake, each group closable, oldest first), **In flight** (one row per Epic, or per Ticket outside one, with its status line, elapsed time and cost), then **Your work** (`ready-for-human`), **Queued** (`ready-for-agent`, the Autopilot priority) and **Done**, closed until opened on the Active Cycle (ADR 0024; ADR 0026 reverted in T1148).
  - A `ready-for-agent` Epic without unarchived children is in Intake, not Queued, until it is split, since it is not eligible (ADR 0027, T1139).
- Intake in Needs you also covers the Backlog, since runs file their feedback Tickets outside any Cycle (see "Feedback as Tickets").
- It offers no actions in its lists. A run waiting on the User shows a bell that opens its Conversation, so the User decides with the run's context in view; a row's title opens the Ticket, where its state is set. Rejected: Allow and Deny in the list, which would approve on a one-line rule; Merged, Back to Todo and triage controls in the list, which the Ticket drawer already offers.
- It derives every place from the Lane derivation, through one pure function over any Board's Tickets.
- A drag only reorders rows within a section; it never changes a Status. The Board also creates Tickets inline, filters, nests an Epic's children in its row and selects many Tickets (Move to Cycle, Add to Epic, Archive).
- Its header carries the Cycle's progress and the Start runs working; Autopilot's switch, spend and paused notice go there in phase 3. The browser tab's title and the Active Cycle's tab carry the Needs you count.

### Status line on In progress cards

Derived from the latest transcript entry of the Ticket's live Conversation (`running` or `waiting`, newest first) by a pure function: a tool entry reads "Reading src/x.tsx", "Editing …", "Running npm run check", "Searching …", "Updating T42"; an agent text entry gives its first sentence; `waiting` shows the question or the permission rule in a few words; `interrupted` and errors say why. Tool names are humanised by an explicit mapping (Read, Edit, Write, Bash with its description, Grep, Glob, Skill, Agent, the Tandembike tools by verb); an unmapped tool shows its bare name and first input value. Elapsed time counts from the run's start (the User's latest message in the Conversation) and ticks client-side once a minute. Shown on Ticket cards in the In progress Lane and on Epic cards, nowhere else. No partial-message streaming, no new SDK plumbing: the runner already stores every tool call and agent text as a transcript entry and the events route announces each. One schema change (2026-11-07): a tool entry today stores the tool name and its input as one text, cut at a fixed length, so the status line would parse truncated JSON. The entry gains two columns, the tool name and the raw input as JSON capped at a few kilobytes; the status line is derived at read time, so the humanising mapping can change without a migration. Part of T1066.

**Cost on cards** (added after the T1060 spike, which spent about $1.60 on a one-line docs change, mostly the `implement` skill's overhead of a fresh worktree, `npm ci` and a full check). Each Conversation already stores its cost, shown in the chat header. A Ticket card shows the total over its Conversations and the live run's running cost on the status line; an Epic card shows its own Conversations' cost plus its children's. No Cycle total yet. Part of the status line child (T1066) of the phase 1 Epic.

### The Agent run merges; Done is one click

2026-11-08: the Agent run is the merge gate. Once CI is green, its review is complete and its acceptance criteria are checked, the run that opened the PR merges it with `gh pr merge` and completes the Ticket, by `docs/agents/issue-tracker.md`. Before, the User merged every PR on GitHub. The Tandembike app itself still never merges, never runs `gh`, and makes no network calls. Agents already add their PR URL to the Ticket, or the Epic, as an External reference. A **Merged** button on Review cards and Epic cards applies the completion rule from `docs/agents/issue-tracker.md`: Status Done, triage state label removed, Claim released; for an Epic, every non-archived child in one call, Todo children included, since the one PR covers the whole Epic (2026-11-07: a child deliberately left out is unplanned or archived first), and the Epic's own label removed. It stays for a PR the User merges, such as one whose CI the run could not fix; it trusts the User and checks nothing. The Board shows the PR link, not CI status; the User sees that on GitHub. Rejected: polling PR state with `gh` from Tandembike; a merge button running `gh pr merge`; a scheduled "finish" Agent run that checks PRs. The existing fallback stays: a later Agent run that finds an In progress Ticket whose PR is merged may move it to Done.

A stalled Ticket shows in Action needed with a **Back to Todo** action. Autopilot never treats a stalled Ticket as eligible: an In progress Ticket without a Claim may be one the User works on in a terminal.

**Back to Todo on every parked card** (2026-11-07). Back to Todo appears on every In progress card without a live Conversation, Review cards included, so a PR closed without merge has a way out: references are history, so the closed PR's URL stays and the card would otherwise sit in Review with only a Merged button. It sets Todo and clears any Claim, including one held by something that is not live, such as a terminal session; the Running section shows the Claim before the User clicks. It is also the retry path: the `ready-for-agent` label stays, so Autopilot picks the Ticket up again at once. On a stalled Epic it sets every In progress child back to Todo in one call and clears the Epic's Claim; Done children stay Done, and the Epic's derived Status follows. Phase 1's T1068 was specced for stalled cards only; the extension to Review and Epic cards is a follow-up Epic on T1059.

### Autopilot dispatch

- A per-Project switch, off by default, on the Board header and in the Project settings. It persists, so it survives a server restart. Starting a Cycle does not flip it on. Turning it off pauses new dispatches and does not stop running runs.
- Continuous while on: immediately on `start_cycle`, and again whenever something becomes eligible (a Ticket planned in mid-Cycle, a Blocker reaching Done, a run slot freeing up). Rejected: one-shot dispatch at Cycle start, which strands Blockers; a manual "run once" button.
- Fills the free slots under the existing parallel runs cap (`parallelRuns` and `maxConcurrentRuns`), in the Cycle Board's Queued lane order, so `sort_lane` is the priority mechanism. No extra budget or per-Cycle cap in version one. Parallel runs off gives a serial factory.
- Starts the same Start Conversation the Start button does, with the Project's Start command or Start command for Epics, and the same brief. The Conversation records Started by Autopilot; the Glossary's "only the User starts a Conversation" and ADR 0019 are revised for the second starter. Rejected: a new intent with its own brief.
- Event-driven inside the one server process (ADR 0002): re-evaluates on Ticket changes, Cycle start, run end, the switch flip and server startup, through one serialised evaluate step so double dispatch is impossible. Rejected: cron, a separate daemon.
- When a Cycle is archived or rolled over, dispatch stops because nothing is eligible; running runs finish their PRs; dispatch resumes when the next Cycle starts.
- No automatic retries. A failed or questioning run leaves its Ticket where it is and shows in Action needed; the User resumes or closes the Conversation. Closing releases the Claim; the Ticket is then stalled until the User sends it Back to Todo.
- Resume after a restart (2026-11-07). A server restart marks runs interrupted (ADR 0019), which is not a failure, and working on Tandembike from Tandembike restarts it often. On startup Autopilot resumes its own interrupted Conversations, within the cap and under the ceiling, before dispatching new work, by sending the fixed reply "The server restarted. Continue T42 from where you left off", recorded in the transcript as sent by Autopilot. Conversations the User started stay interrupted until the User replies, as today. No limit on resumes per Conversation: the ceiling bounds a crash loop.
- Autopilot leaves `needs-triage` alone, including the Tickets Agents file. The path into the factory is a `ready-for-agent` label on a Ticket planned into the Active Cycle. Auto-triage can be a later switch.
- Agents may feed the factory (2026-11-07). An Agent run can make work eligible over MCP: `/to-tickets` creates Epics and children already labelled `ready-for-agent`, a New Ticket Conversation defaults to the Cycle it was started from, and any run can plan or label. So with Autopilot on, a spec run ends in build runs, which is the point. This revises ADR 0019's rule that no Agent can start a run: the Autopilot switch is the User's standing consent, flipped only through a Server Action, and the run cap and the spend ceiling bound what that consent buys. Rejected: counting only labels the User set, read from Activity, which would make every `/to-tickets` result need a manual re-label.
- Per Project only; no global cap across Projects in version one.

**Spend ceiling** (2026-11-07, replacing "no budget cap in version one"). The spike spent about $1.60 on a one-line change, the classifier is permissive, and the factory runs while the User is away, so one number per Project is the kill switch. The ceiling is a Project setting in dollars, next to the Autopilot switch, with no default; Autopilot cannot be turned on while the Project has none. It is measured against the total cost of Autopilot-started Conversations on the Active Cycle's Tickets, resumes included, so it resets with each Cycle and hand-started runs do not count. When crossed, dispatch pauses, the switch stays on, the Board header shows "paused: over ceiling" with the amount, and raising the ceiling or starting the next Cycle resumes it; running runs finish. The Board header shows the Cycle's Autopilot spend against the ceiling (2026-11-07, both were on the Board header). Rejected: flipping the switch off, which loses the User's intent; a rolling per-Project total that never resets; counting every Conversation in the Cycle.

### Agent run mode

The permission relay (ADR 0021) idles a run until the User answers every unlisted call, so a factory is only as hands-off as the repository's allowlist. The User does not want to press Allow constantly. The installed Claude Agent SDK offers `permissionMode: 'auto'`, where a classifier allows safe calls and escalates the rest. Agent run mode becomes a per-Project setting, `default` (today's behaviour) or `auto`, applied to every run the Project starts, factory or by hand; existing Projects keep `default`. The User turns `auto` on per Project on the settings page, with the trade-off written next to the switch; Setup reports the mode and does not suggest it (decided after the spike, replacing the earlier "Setup suggests `auto`"). ADR 0021 noted that whether auto-mode escalations reach the relay through `canUseTool` was unverified. Phase 0 (T1060, `docs/research/auto-permission-mode.md`) settled it: `auto` is the decision. The SDK prompts through `canUseTool` only when the classifier cannot decide; in the spike the classifier decided every one of 24 calls, all allowed, and the run completed a Ticket to an open PR without a prompt. A classifier denial comes back to the model as the tool's result with an instruction to stop and explain, so in a Conversation it shows as an `idle` run with an explanation, which the Board already marks as needing the User. The classifier is permissive: it allowed a hard reset, a file written and removed in the home directory, an outbound POST and a push with a PR; the ADR for the setting states this, and the mode stays per Project and `default` unless the User turns it on. `acceptEdits` plus the allowlist is dropped as a fallback: it would prompt for every push and PR and gain no safety for Bash. `bypassPermissions` stays off the table: runs start in the main checkout before moving to a worktree. Rejected: a factory-only mode; a hard-coded switch to `auto`; `permissionPrompts: 'none'` for Autopilot runs, which would deny the rare undecidable call instead of waiting for the User, kept as an option if waiting runs pile up; parsing a classifier denial into a dedicated state, since `idle` plus the run's explanation on the status line is enough.

**Git guardrail (T1081).** The git side of the classifier's permissiveness is closed deterministically: a committed PreToolUse hook in this repository denies force pushes, pushes to `main`, `git reset --hard`, `git clean`, `git branch -D`, `git stash drop` and `git stash clear`, for Agent runs in any mode and for terminal sessions alike, with a message naming the rule. `git checkout --` and `git restore` stay allowed. The hook is the repository's own (ADR 0014, 0019), not injected by Tandembike, so it protects this repository only: another Project's repository needs its own before Autopilot is turned on there. Setup gains an advisory checklist item for it in the Autopilot phase. Bash outside the repository stays unbounded: that is the trade accepted for hands-off.

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

Done on 2026-11-06 (T1060): `docs/research/auto-permission-mode.md`. Decision: `auto`. See "Agent run mode" above.

### Phase 1: Board lanes

Goal: a Board that shows the factory's state before any dispatcher exists. Useful today for runs the User starts by hand.

- Five derived Lanes with the In progress sections; same Lanes on Project and Cycle Boards; empty Lanes collapse; drag unchanged.
- Epic cards gain the state badge.
- Status line on In progress cards and Epic cards, with elapsed time.
- Merged button on Review cards and Epic cards; Back to Todo on stalled cards.
- The Board loads each Ticket's live Conversation state and latest transcript entry, and updates them over the events route.

Decision records: ADR "Lanes are derived from Status, labels and run state"; Glossary: Lane revised, Status line, Stalled, Your work.

Specced as Epic T1059 on 2026-11-06. The 2026-11-07 amendments that reached it: the idle rule went into T1065 and the tool entry columns into T1066 before they were built; Back to Todo on Review and Epic cards, and Merged on an Epic covering Todo children, came after T1068 and T1069 were specced and are a follow-up Epic with T1059 as its Origin, by "Publishing a spec" in `docs/agents/issue-tracker.md`.

### Phase 2: feedback as Tickets

Goal: nothing a run learns is lost in a reply. (Was phase 3; see phase 3.)

- New section in `docs/agents/issue-tracker.md`; `AGENTS.md` feedback rules shortened to point at it; `implement` skill's hand-off step calls it.
- Labels `from:agent-run` introduced; `from:tandembike` kept for Blocks.

Docs and skills only, no app change.

Done on 2026-11-08 (T1090): "Feedback as Tickets" in `docs/agents/issue-tracker.md`; the `AGENTS.md` Blocks and process feedback rules point at it; the `implement` skill's hand-off step files the feedback. Sources are `from:agent-run` and `from:tandembike`.

### Phase 3: Autopilot

Goal: the first hands-off Cycle. (Was phase 2; swapped with feedback as Tickets on 2026-11-07, so the first hands-off Cycle loses no feedback in replies nobody reads.)

- Agent run mode setting, per Project, with the runner honouring it, the trade-off written next to the switch, and Setup's checklist gaining "a hook blocks destructive git" (advisory, reporting only).
- Autopilot switch, stored per Project, on the Board header and settings, with the spend ceiling beside it and required to turn the switch on.
- The dispatcher: eligibility query (an Epic needs a child), lane-order selection, slot accounting against the existing cap, the ceiling check, one serialised evaluate step, triggered by events and on startup; on startup it resumes Autopilot's interrupted Conversations first.
- Conversations record Started by; the header shows it. Autopilot's resume reply is recorded as sent by Autopilot.
- The paused-over-ceiling notice and the Cycle's spend against the ceiling on the Board header; the Needs you count is already in the browser tab's title.

Decision records: ADR "Autopilot dispatches the Active Cycle's ready work", recording that Agents may feed it and the ceiling; ADR "Agent run mode is a Project setting" superseding ADR 0021's pinned `default`; ADR 0019 amended for the second starter and for Agent-fed work; Glossary: Autopilot, Eligible, Agent run mode, Started by, Spend ceiling.

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

- **Auto mode and the relay.** Settled by phase 0: the relay is used only when the classifier cannot decide, which the spike never hit. A run that waits for hours on such a prompt while the User is away is still possible; `permissionPrompts: 'none'` would turn that into a denial and is an option for Autopilot runs if it happens.
- **Auto mode's judgement.** Confirmed permissive by phase 0: the classifier allowed a hard reset, writes and removals outside the repository, an outbound POST and a push with a PR without asking. Worktrees bound git, nothing bounds Bash. The User's repositories are not all trusted equally, so the setting is per Project and `default` unless turned on.
- **Merge is on the critical path.** A Blocker only clears at Done, which needs the User's merge. A Cycle with a long Blocker chain runs at the User's merging pace. The Merged button makes it one click; a chained-branch mode (dependant branches off the open PR) is a possible later addition and is not planned.
- **Stalled detection.** "No Claim and no PR" is a heuristic; a terminal session without a Claim looks stalled. The Back to Todo action is manual for this reason.
- **Status line quality.** Tool-name mapping needs maintaining as skills and tools change; an unmapped tool degrades to its bare name, never to nothing.
- **Dispatcher correctness.** Double dispatch, dispatch after the switch is off, dispatch over the ceiling, dispatch of an Epic without children, and resume and dispatch across a server restart are the cases the tests must cover, through the public Conversations and Tickets modules.
- **Token cost.** The run cap bounds concurrency; the spend ceiling bounds spend per Cycle (2026-11-07). Measured over five Start runs (2026-11-08, `docs/research/start-run-cost.md`), setup is not the main per-run overhead. Worktree and install were 5–11% of a run's cost and the final check 1–2%, though together they were half of the spike's 168 s. The largest fixed share is the brief: the system prompt, tools, skill list and process docs written to the prompt cache before any work. It was 56–59% of a trivial run ($0.94 of the spike's $1.60) and 17–30% of a code run. Trivial runs cost $0.61 on Opus 5.5 and $1.60 on Fable 5.1, and code runs $0.88–1.78 on Opus. The file ranks the cuts; the model a run uses and sharing the fixed context between consecutive runs save the most. Whether a shared, pre-prepared worktree is acceptable under ADR 0019 is the User's open decision.
- **Agent-fed work** (2026-11-07). A run that files or labels work can cause runs. The switch, the cap and the ceiling bound it; watch the first Cycles for a spec run whose children were not worth building, and consider counting only User-set labels if it happens.
- **Brief staleness.** ADR 0019 revisits the brief after about 20 Start runs. Autopilot will hit that quickly; watch transcripts for an Agent deciding badly for lack of Epic or Cycle context.
