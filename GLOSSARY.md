# Tandembike

A personal ticket tracker, used by one person and by AI agents working on their behalf.

## Language

**Ticket**:
A single unit of work to be tracked from creation to completion.
_Avoid_: Task, issue, item, card

**Ticket number**:
The number that identifies a Ticket across the whole app, written `T42`. It never changes, even when the Ticket moves to another Project.
_Avoid_: Ticket key, ticket ID, `#42` (other systems, such as GitHub, claim it), `WEB-12`-style keys

**Project**:
A named group of Tickets. Every Ticket belongs to exactly one Project. A Project's name is unique, ignoring case and surrounding spaces; a Project can be renamed and archived, but never deleted. The User can give a Project a colour and an icon, from fixed sets, to tell it apart at a glance.
_Avoid_: Workspace, sub-project

**Cycle**:
A goal-led set of Tickets within one Project, not defined by a fixed duration. A Cycle is Prepared, Active, or Archived; a Project may have multiple Prepared Cycles but at most one Active Cycle, and a Ticket can be planned in only one non-archived Cycle at a time. An Active Cycle is **complete** when it has at least one unarchived Ticket planned in it and every one is Done, an Epic by its derived Status; its Board then shows a banner offering to archive it, and archiving stays the User's click (ADR 0010). Starting and archiving a Cycle, like renaming one and ordering a Lane, are the User's, in the UI only; an Agent proposes a Prepared Cycle with `create_cycle` (ADR 0037).
_Avoid_: Sprint

**Backlog**:
A Project's Tickets that are in no Prepared or Active Cycle, the work not yet planned. An Archived Cycle's unfinished Tickets leave it and return here as it is archived; its Done Tickets stay with it and are not in the Backlog.
_Avoid_: Inbox, unplanned list

**Epic**:
A Ticket, fixed as such when created, that groups child Tickets of the same Project so they can be handed off as one unit. A Ticket belongs to at most one Epic, and an Epic cannot be a child. An Epic's Status is always derived from its children: it is Done once it has at least one child and every child is Done or archived. Claiming it covers its children. Every Epic has a colour, from a fixed set, that marks its children so related Tickets stand out. Planning an Epic into a Cycle, or removing it from one, by hand offers to take its non-archived children along (those in that Cycle, when removing), all or nothing (ADR 0010).
_Avoid_: Feature, parent Ticket, story

**Origin**:
The Ticket another Ticket was split from, such as the spec a build Ticket came out of. A Ticket has at most one Origin, possibly in another Project; the Tickets split from one Origin form a group whose members are each worked on their own. It records provenance only: it does not affect Status, Claims or Blockers.
_Avoid_: Parent, source, spec link

**Board**:
The view of one Project's Tickets in one column, for the Active Cycle, each Prepared Cycle and the Backlog. A Board shows only its own Tickets, those planned in its Cycle or in the Backlog; the one exception is an Epic planned elsewhere, which joins a Cycle's Board as the row holding its children planned there (ADR 0025). It groups the Lanes by what the User needs to do first: Needs you, then In flight, then Your work and Queued (closed until opened on the Active Cycle's Board, open on a planning Board) and Done (closed until opened), with the Archived Tickets at the bottom (ADR 0024). A planning Board hides its empty sections. It has a header with the Cycle's progress and a New Ticket field, which creates a Ticket in Intake. Its rows offer no actions: a row's title opens the Ticket, and a run waiting on the User shows a bell that opens its Conversation. A drag only reorders rows within a section; it never changes a Status or a label (ADR 0024). Every Epic is placed by its Lane and shows its children on this Board nested in its row, except a child in Needs you, which also appears there; its children on other Boards stay off it, though its cost counts them all. An Epic with none of its children on the Board says so where they would be: that it has no children yet, or how many it has on other Boards (ADR 0025); a `ready-for-agent` Epic in Intake says instead that it is ready for an Agent once triage splits it (ADR 0027). An In progress Epic is a row of In flight while its run is Running, and of Needs you in Action needed or Review, as for a Ticket, with its children bar either way; an Epic in Intake is an expandable Intake row. Without an Active Cycle, its place points to the Prepared Cycles to start.
_Avoid_: Cockpit, Kanban, dashboard, inbox, list

**Lane**:
A situation a Ticket or Epic is in, derived from its Status, its triage state label and, for In progress, the run state of its Conversation, never stored. The Lanes are Intake, Queued, In progress, Your work and Done. The Board shows them as its sections; a drag reorders rows within one and never moves a Ticket to another Lane. A Ticket changes Lane when its Status or labels change, through the Ticket drawer. A `ready-for-agent` Epic not yet split is in Intake: see **Intake**.
_Avoid_: Column, drop area

**Stalled**:
An In progress Ticket or Epic with no live Conversation, no Claim and no pull request among its External references, such as one whose Conversation the User closed. A child of an Epic with none of the three is stalled only when its Epic is (ADR 0028). It shows in the Action needed section of the In progress Lane. Back to Todo is offered on any In progress Ticket or Epic without a live Conversation, stalled or not.
_Avoid_: Stuck, orphaned

**Status line**:
The one line on an In progress card saying what its live Conversation is doing now, such as "Reading board.tsx" or "Updating T42", with how long the run has been going and what it has cost so far (a Terminal run shows the time only; it has no cost). It is made from the Conversation's latest transcript entry and cut to one line, with the full text as a tooltip. A card without a live Conversation has none.
_Avoid_: Progress line, activity line

**Queued**:
The Lane for Todo Tickets and Epics labelled `ready-for-agent`: work an Agent can take. Its order is the Autopilot priority, set by dragging. A `ready-for-agent` Epic not yet split is in Intake, not here: see **Intake**. Formerly called Todo.
_Avoid_: Todo Lane, Ready

**Intake**:
The Lane for Todo Tickets and Epics still to triage: labelled `needs-triage` or `needs-info`, or with no triage state label. A Todo Epic labelled `ready-for-agent` with no unarchived children, on any Board, is in Intake, not Queued, until it is split (ADR 0027). It is the last group of Needs you, and a Ticket created on the Board starts there.
_Avoid_: Inbox, Untriaged

**Your work**:
The Lane for Todo Tickets labelled `ready-for-human`: work the User does. It does not mean the Ticket needs the User now; that is Needs you. Formerly called For human.
_Avoid_: For human, Waiting on me

**Needs you**:
The Board's first grouping: the Tickets and Epics waiting on the User, which are those in the Action needed section of the In progress Lane, those in Review, and Intake. Each Board's Needs you holds only its own Tickets: the Backlog's Intake is on the Backlog's Board, not the Active Cycle's (ADR 0025). `ready-for-human` work is not Needs you: it is the User's own work, not a request. The Active Cycle's count shows on its tab, and the Backlog's tab badge of open Tickets turns to a warning and names its Intake count while it has any; a Board's count shows in the browser tab title. These counts ignore the Board filter.
_Avoid_: Action items, attention list

**In flight**:
The Board's second grouping: the Running section of the In progress Lane, one row per Epic or per Ticket outside one, with what its run is doing, how long it has run and what it has cost.
_Avoid_: Active, running list

**Board filter**:
A narrowing of a Board to the Tickets whose title or Ticket number contains a search text and that have every chosen Label. It sits at the top of the Board and narrows every section, and the section counts show the filtered numbers. It only hides Tickets from view: it changes no Ticket, and a hidden Ticket keeps its Status and place. The Needs you count in the tab and the browser title ignores it.
_Avoid_: Search, view, saved filter

**Stats**:
The view of every non-archived Project's figures side by side: per Project, how many Tickets are in Todo and In progress, blocked and claimed, the Active Cycle's progress, and how many were done in the last 7 days. Epics are not counted, since their Status follows their children. A Ticket counts as done in the last 7 days when it is Done now and last reached Done within that window, even if archived since.
_Avoid_: Dashboard, report, overview, metrics

**Status**:
Where a Ticket stands: one of a fixed set, **Todo**, **In progress** or **Done**. A Ticket can move between any two Statuses.
_Avoid_: State, stage, column

**Acceptance criterion**:
An optional, independently verifiable condition describing a Ticket's desired outcome. It can be checked off separately; doing so does not change the Ticket's Status.
_Avoid_: Checklist task

**Label**:
A short tag on a Ticket that classifies it, such as `bug` or `needs-triage`. Labels are stored trimmed and lower-cased; a Ticket has each at most once and can have any number. A label exists only while some Ticket has it.
_Avoid_: Tag, category, triage metadata

**External reference**:
A URL or key, such as `#55` or `ABC-33`, that points to the same work in another system, such as a GitHub issue or pull request or a Jira issue. A Ticket can have up to 50 of them, each at most once, and the User or an Agent can add or remove them. Several Tickets may point to the same work.
_Avoid_: External link, external ID, URL, link

**Reference template**:
A Project's rule that turns External reference keys starting with a given prefix, such as `#` or `ABC-`, into a URL, so they open as links. A Project can have several; the first whose prefix matches applies. Only the User manages them. A key keeps its text, and is linked by the templates of whichever Project its Ticket is in.
_Avoid_: Link template, URL pattern

**Comment**:
A Markdown note on a Ticket that shares progress or context without changing its description. Its author is `user` or `agent`: the UI writes `user`, MCP writes `agent` through `add_note`. Editing or removing a Comment is the User's, in the UI only (ADR 0037).
_Avoid_: Note, reply, update

**Attachment**:
A file the User or an Agent adds to a Ticket, an Epic included, such as a screenshot or a log, kept with the Ticket. It belongs to the Ticket, not to a Comment or the description. Its author is `user` or `agent`, as for a Comment; its name and content never change once added, and two Attachments may share a name. Agents add (`attach`) and read (`read_attachment`) them; removing one destroys it for good and is the User's, in the UI only (ADR 0037). Archiving a Ticket keeps its Attachments; deleting it destroys them.
_Avoid_: File, upload, asset

**Blocker**:
A Ticket that must be resolved before another Ticket can start. A Blocker is resolved once it is Done or Archived; a Ticket is **blocked** while any of its Blockers is unresolved, and ready to start when none is. A Ticket cannot block itself, Blockers never form a cycle, and they may cross Projects. Archiving a Ticket keeps its Blockers.
_Avoid_: Dependency, prerequisite, `Blocked by:` lines

**Claim**:
A cooperative marker on a Ticket identifying the Agent run working on it. `start_work` takes it; only one Agent run can hold a Ticket's Claim. `abandon_work` or `open_pr` with `handOff: true` releases it, the User can clear it, and moving the Ticket to Done (`finish_work`) releases it. Claims are not an authorization boundary.
_Avoid_: Lock, reservation

**Agent-run ID**:
A unique identifier for one Agent run, used to claim Tickets independently of its optional display name. Runs Tandembike starts send it in the `X-Tandembike-Run` header, so their tool calls need not pass it; so does a `tandembike start` session, whose `TANDEMBIKE_RUN` the registered header carries, and its calls feed the Ticket's Status line. Any other terminal session passes `agentRunId` itself (ADR 0037, ADR 0039).
_Avoid_: Agent name as the owner identifier

**Conversation**:
An exchange between the User and an Agent that Tandembike starts for them, about one Ticket or, before a Ticket exists, about one Project. It opens with an intent, **Start**, **Triage**, **Setup**, **Retro**, **Spec**, **Merge** (started by Approve merge), a free-form **Ask** or **New Ticket**, and continues as the User replies, answers the Agent's questions and allows or denies what it asks to do. It can span several Agent runs, since an interrupted one is resumed, and it is the Agent-run ID its Agent claims Tickets with. A **New Ticket** Conversation is Project-scoped: the User starts it from a title field, whose Cycle, Epic and type are the Agent's defaults, and the Agent decides what to create. A **Retro** Conversation is Project-scoped too: the User starts it from the Cycle complete banner to look back on one Cycle, which it records apart from the Cycle Autopilot started a Conversation for, so a Retro never counts against the Spend ceiling; a Cycle has at most one, and it stays reachable once the Cycle is archived. A **Spec** Conversation is about one Ticket, an idea in Intake or an Epic without children: the User starts it from the Spec button, never Autopilot, and it runs in the main checkout outside the Start run limit. The Agent grills the User, writes the spec into a new Epic with the idea as its Origin (or into the childless Epic itself) and splits it into `ready-for-agent` Tickets, labelling none until the User approves the breakdown. A **Terminal** Conversation is the exception to the rest: the User starts it with `tandembike start` and answers in their terminal, where interactive `claude` runs in its worktree. Tandembike runs nothing for it and it takes no replies, no Stop and no Run outcome; it is In flight while its session is open and `stopped` once the CLI reports the end (ADR 0039). A UI Conversation with an SDK session can become one with **Continue in terminal** (`tandembike resume <id>`), which stops its run and keeps its cost. A Ticket can have several Conversations; the User starts one by sending its first message, or Autopilot starts one in their place (see **Started by**).
A Conversation is **open** until the User closes it, whatever its run is doing; closing stops its run and keeps its transcript.
The User can always reply: their reply is never refused by the Project's Start run limit, whether it goes into an idle run or resumes an interrupted, stopped or closed one. A new Start, and a reply Autopilot sends, stay limited. See ADR 0031.
_Avoid_: Session, run, chat, thread, active Conversation (Active belongs to Cycles)

**Autopilot**:
A Project switch, off by default, that makes Tandembike start Start Conversations for the Active Cycle's **Eligible** work by itself, in the Cycle Board's Todo order, up to the Project's free Start run slots. It needs a Spend ceiling to be turned on, stays on across restarts, and is not turned on by starting a Cycle. Turning it off stops new dispatches and leaves running runs alone. A User's reply can take the Project over its Start run limit; Autopilot then dispatches nothing until the working Start runs drop below it (ADR 0031). It resumes a Start Conversation once after a transient end (API overload, rate limit or network error), a minute later and within the run limit and Spend ceiling, and retries nothing else (ADR 0034); it never changes a Ticket's Status or labels. Only the User sets it, through a Server Action, and it is not part of the Project the MCP tools show. See ADR 0030 and ADR 0034.
_Avoid_: Auto mode (that is the Agent run mode), scheduler

**Check command**:
A Project's command that defines green for its repository, such as `npm run check`. A Start run's brief names it as what must pass before the run opens a pull request; with none set, the brief tells the run to follow the repository's own instructions. Only the User sets it, through a Server Action, and it is not part of the Project the MCP tools show, so no Agent can redefine green for itself.
_Avoid_: Test command, build command

**Prepare command**:
A Project's command, such as `npm ci`, that Tandembike runs through the User's shell in each new worktree before the run starts, so the run finds its dependencies ready. When it exits non-zero no run starts: its output goes into the transcript as an error entry and the Conversation is interrupted, so its Ticket shows in Action needed. With none set, the run starts right after the worktree is created. Only the User sets it, through a Server Action, and it is not part of the Project the MCP tools show, so no Agent can make Tandembike run a command of its choosing.
_Avoid_: Setup command, install command

**Eligible**:
Work Autopilot may start: a Ticket or Epic in the Active Cycle that is Todo, labelled `ready-for-agent`, not blocked, unclaimed, not archived and not an Epic's child, an Epic only once it has a child, and with no open Start Conversation on it, whatever state its run is in, so a failed run waits for the User. A Start Conversation from before the Ticket's latest move to Todo, such as Back to Todo, no longer counts, unless its run is still working.
_Avoid_: Ready (that is the label), startable

**Started by**:
Who started a Conversation: the **User**, **Autopilot**, or **Terminal**, the User's `tandembike start` in a terminal (ADR 0039). Every Conversation records it and its header shows it; Conversations from before it was recorded read the User. A reply is sent by the User or by Autopilot too, and a transcript shows an Autopilot message as sent by Autopilot, apart from the User's.
_Avoid_: Owner, author, initiator

**Run outcome**:
The record a Conversation's run leaves when it ends: a turn result, an exit or the User's stop. It holds the Conversation, Project and Ticket, the Stage (the Conversation's intent), the result, when the run started and ended, what it cost, the model, the command its first message started with and whether Autopilot started it. The result is the first that matches: `stopped` (the User stopped it), `failed_transient` or `failed` (the end carries an error; transient means an API overload, rate limit, 5xx or network error, everything else is substantive), `completed` (the Ticket is Done), `pr_open` (the Ticket has a PR reference), `abandoned` (a Start whose Ticket is Todo), else `needs_reply`. Only the Conversations module writes and reads Run outcomes, never an MCP tool, so no Agent can shape its own statistics, and the Estimate reads them; they stay when a Conversation is closed. The Stats page shows them per Project and Stage over the last 30 days. A Conversation Started by Terminal records none: Tandembike sees no result, cost or model of an interactive session (ADR 0039).
_Avoid_: Run result, run log

**Estimate**:
What a Prepared Cycle should cost, worked out from Run outcomes and shown on its Board header as "Estimated ≈ $X for N Tickets". The per-Ticket figure is the median cost of the Project's last 20 Start Conversations, by when their latest run ended, that reached `completed` or `pr_open`, however old; each Conversation's cost sums its runs, so a resumed one counts once. With fewer than 5 such Conversations there is none, and the header says "Not enough runs to estimate". N counts each Ticket as 1 and each Epic as its unarchived, not-Done children planned in the Cycle, or 1 when it has none. Agents never read it through MCP.
_Avoid_: Budget, forecast

**Spend ceiling**:
A Project setting in dollars, with no default, that bounds what Autopilot spends in one Cycle; Autopilot cannot be turned on without one. The spend is the total cost of the Conversations Autopilot started for that Cycle, resumes included; each Conversation records the Cycle it was started for, so it resets with each Cycle and hand-started runs do not count. At or over the ceiling Autopilot dispatches nothing new, the switch stays on and running runs finish; raising the ceiling or starting the next Cycle resumes dispatch. The Active Cycle's Board header shows the spend against the ceiling and "paused: over ceiling" with the amount while paused.
_Avoid_: Budget, cap (that is the run cap), limit

**Draft**:
A Conversation the User has begun but not yet sent: an intent, its Ticket or Project, and the text typed so far, with a New Ticket draft also holding its title field's defaults. Nothing runs until the User sends it, which starts the Conversation. A Draft lives only in the browser tab: a reload loses it, and closing it discards it.
_Avoid_: Pending Conversation, unsent Conversation

**Setup**:
A Conversation about a Project in which the Agent checks that the Project's repository has what Tandembike's Agent runs rely on, and offers to add what is missing. It is advisory: it never stops the User from using agent mode, and the User can hold it again at any time.
_Avoid_: First-time setup, onboarding, readiness check

**Agent run mode**:
A Project setting, `default` or `auto`, that every run the Project starts uses as its permission mode, whoever starts it. `default` asks the User about every call the repository has not allowed; `auto` lets the SDK's classifier decide and asks only for calls it cannot. New Projects are `auto`; existing Projects keep their mode. Only the User sets it, through a Server Action, and it is not part of the Project the MCP tools show. The Project also has a run model, the model its runs start on, unset for the User's default. See ADR 0029.
_Avoid_: Permission level, trust mode

**Skill**:
A Claude Code command, such as `/mattpocock-skills:grilling`, that a Project offers in its Conversations and Drafts as a chip above the message field. A click puts the command at the start of the message; it sends nothing. Only the User sets a Project's Skills, in order, on its Settings; Tandembike does not check that the Agent has them.
_Avoid_: Command chip, preset, slash command (for the setting)

**Playbook**:
Tandembike's own Claude Code plugin, named `tandembike`, bundled with the app and loaded into every run. It has one skill per **Stage**, written to work in any repository and to use only Tandembike's workflow tools. It keeps the MIT notice of `mattpocock-skills`, which its skills are adapted from, and has a `version` that is bumped whenever its files change. A Project's **Agent command** overrides it for one Stage. See ADR 0032.
_Avoid_: Default skills, process, built-in prompts

**Merge gate**:
The point where a Ticket or Epic in Review, whose PR the Agent reviewed and opened, waits for the User's **Approve merge** in its drawer. The click resumes the Start Conversation if it is open, or starts a **Merge** Conversation in a worktree; that run waits for green checks, rebases when behind, merges through the host CLI and calls `finish_work`, or comments why and stops. A Start run never merges its own PR, Autopilot never approves, and an approved merge stays outside the Spend ceiling and counts against the Start run limit. **Merged** stays for a PR the User merged by hand. See ADR 0038.
_Avoid_: Auto-merge, merge button (for Approve merge)

**Stage**:
One step of the flow that a Playbook skill, and an Agent command, run: Triage, Start (`implement`), Start on an Epic (`implement-epic`), Retro, Spec (`spec`) and Merge (`merge`), with more to come. Each Stage has one Agent command field and one skill; its command is the Project's when set, otherwise `/tandembike:<skill>`, and no Stage falls back to another's command.
_Avoid_: Step, phase, workflow

**Agent command**:
A Claude Code command that a Stage sends as the first message of a run, followed by the Ticket number, or by the Cycle for a Retro, such as `/tandembike:implement T42`. A Project has a **Triage command**, a **Start command**, a **Start command for Epics**, a **Retro command**, a **Spec command** and a **Merge command**. A blank one sends the Playbook's command for its Stage, always namespaced, so a new Project works without settings; one the User sets replaces it for that Stage only, so a repository keeps its own skills. The Retro command is followed by the Cycle's title and id (`/tandembike:retro "Factory p2" (Cycle 44)`). Only the User sets them, on the Project's Settings, where each blank field shows the Playbook command it runs; Tandembike does not check that an override's skill exists.
_Avoid_: Triage skill, Start skill, preset

**Activity**:
A Ticket's record of the changes made to it, one **Activity entry** per action. Each entry lists every change the action made, when, and whether the User or an Agent made it. Comments are not Activity entries; they appear beside them.
_Avoid_: History, event, audit log, changelog

**Archived**:
A Ticket or Project taken out of the normal views without being destroyed; it can be restored. An archived Project hides its Tickets and keeps them, and itself, read-only until it is restored; only the User archives a Project. An Epic is archived only once its children are: the User can archive it with its children in one step, and restoring it brings back the children archived with it, not ones archived before. Archiving a Cycle leaves its Epics and their children as they are.
_Avoid_: Removed, trashed, closed

**Deleted**:
A Ticket the User has destroyed for good; it cannot be restored, and its number is never used again. Only the User deletes; an Agent archives instead.
_Avoid_: Archived, removed, purged

## Actors

**User**:
The one person who owns and uses the app.
_Avoid_: Owner, admin, customer

**Agent**:
An AI coding agent that works with Tickets on the User's behalf.
_Avoid_: Bot, assistant, client
