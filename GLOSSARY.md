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
A goal-led set of Tickets within one Project, not defined by a fixed duration. A Cycle is Prepared, Active, or Archived; a Project may have multiple Prepared Cycles but at most one Active Cycle, and a Ticket can be planned in only one non-archived Cycle at a time. An Active Cycle is **complete** when it has at least one unarchived Ticket planned in it and every one is Done, an Epic by its derived Status; its Board then shows a banner offering to archive it, and archiving stays the User's click (ADR 0010). Starting and archiving a Cycle, like renaming an Active or Archived one, are the User's, in the UI only; an Agent proposes a Prepared Cycle with `create_cycle` and may rename a Prepared one with `update_cycle` (ADR 0037).
_Avoid_: Sprint

**Backlog**:
A Project's Tickets that are in no Prepared or Active Cycle, the work not yet planned. An Archived Cycle's unfinished Tickets leave it and return here as it is archived; its Done Tickets stay with it and are not in the Backlog.
_Avoid_: Inbox, unplanned list

**Epic**:
A Ticket, fixed as such when created, that groups child Tickets of the same Project so they can be handed off as one unit. A Ticket belongs to at most one Epic, and an Epic cannot be a child. An Epic's Status is always derived from its children: it is Done once it has at least one child and every child is Done or archived. Claiming it covers its children. Every Epic has a colour, from a fixed set, that marks its children so related Tickets stand out. Planning an Epic into a Cycle, or removing it from one, by hand offers to take its non-archived children along (those in that Cycle, when removing), all or nothing (ADR 0010).
_Avoid_: Feature, parent Ticket, story

**Child state**:
Where a child of an Epic stands in its Epic's children bar, by its own progress, never by the section it takes from its Epic's run (ADR 0028): **queued** (Todo), **started** (In progress, not built), **built** (In progress with every acceptance criterion checked: finished on the Epic's branch, waiting for the Epic to merge) and **done**. A child shows **needs you** only when its own Conversation needs the User; an Epic run's need for the User is on the Epic's row. The bar counts done and built children together.
_Avoid_: Running, in review (for a child)

**Origin**:
The Ticket another Ticket was split from, such as the spec a build Ticket came out of. A Ticket has at most one Origin, possibly in another Project; the Tickets split from one Origin form a group whose members are each worked on their own. It records provenance only: it does not affect Status, Claims or Blockers.
_Avoid_: Parent, source, spec link

**Board**:
The view of one Project's Tickets in one column, for the Active Cycle, each Prepared Cycle and the Backlog. A Board shows only its own Tickets, those planned in its Cycle or in the Backlog; the one exception is an Epic planned elsewhere, which joins a Cycle's Board as the row holding its children planned there (ADR 0025). It groups the Lanes by what the User needs to do first: Needs you (with Your work among its groups), then In flight, then Queued (closed until opened on the Active Cycle's Board, open on a planning Board) and Done (closed until opened), with the Archived Tickets at the bottom (ADR 0024, ADR 0048). A planning Board hides its empty sections. It has a header with the Cycle's progress and a New Ticket field, which creates a Ticket in Intake. Its rows offer no actions: a row's title opens the Ticket, and a run waiting on the User shows a bell that opens its Conversation. A drag only reorders rows within a section; it never changes a Status or a label (ADR 0024). An Agent may move a Ticket before or after another of its Status with `update_ticket`, recorded in its Activity (ADR 0037). Every Epic is placed by its Lane and shows its children on this Board nested in its row, except a child in Needs you, which also appears there; its children on other Boards stay off it, though its cost counts them all. An Epic with none of its children on the Board says so where they would be: that it has no children yet, or how many it has on other Boards (ADR 0025); a `ready-for-agent` Epic in Intake says instead that it is ready for an Agent once triage splits it (ADR 0027). An In progress Epic is a row of In flight while its run is Running, and of Needs you in Action needed or Review, as for a Ticket, with its children bar either way; an Epic in Intake is an expandable Intake row. Without an Active Cycle, its place points to the Prepared Cycles to start.
_Avoid_: Cockpit, Kanban, dashboard, inbox, list

**Lane**:
A situation a Ticket or Epic is in, derived from its Status, its triage state label and, for In progress, the run state of its Conversation, never stored. The Lanes are Intake, Queued, In progress, Your work and Done. The Board shows them in its sections, Intake and Your work as groups of Needs you (ADR 0048); a drag reorders rows within one and never moves a Ticket to another Lane. A Ticket changes Lane when its Status or labels change, through the Ticket drawer. A `ready-for-agent` Epic not yet split is in Intake: see **Intake**.
_Avoid_: Column, drop area

**Stalled**:
An In progress Ticket or Epic with no live Conversation, no Claim and no pull request among its External references, such as one whose Conversation the User closed. A child of an Epic with none of the three is stalled only when its Epic is (ADR 0028). It shows in the Action needed section of the In progress Lane. Back to Todo is offered on any In progress Ticket or Epic without a live Conversation, stalled or not.
_Avoid_: Stuck, orphaned

**Status line**:
The one line on an In progress card saying what its live Conversation is doing now, such as "Reading board.tsx" or "Updating T42", with how long the run has been going and what it has cost so far (a Terminal run shows the time only; it has no cost). It is made from the Conversation's latest transcript entry and cut to one line, with the full text as a tooltip. A card without a live Conversation has none. A tool call ("Running …") shows only while the Conversation is running: a waiting, idle, interrupted or failed Conversation's row shows the Agent's latest message instead, what it said or asks (a permission request as its rule), so a bell always comes with the message that explains it.
_Avoid_: Progress line, activity line

**Queued**:
The Lane for Todo Tickets and Epics labelled `ready-for-agent`: work an Agent can take. Its order is the Autopilot priority, set by dragging. A `ready-for-agent` Epic not yet split is in Intake, not here: see **Intake**. Formerly called Todo.
_Avoid_: Todo Lane, Ready

**Intake**:
The Lane for Todo Tickets and Epics still to triage: labelled `needs-triage` or `needs-info`, or with no triage state label. A Todo Epic labelled `ready-for-agent` with no unarchived children, on any Board, is in Intake, not Queued, until it is split (ADR 0027). It is the last group of Needs you, after Your work, and a Ticket created on the Board starts there. A Ticket with a pending triage proposal shows a "Triage proposed" marker there.
_Avoid_: Inbox, Untriaged

**Your work**:
The Lane for Todo Tickets and Epics labelled `ready-for-human`: work handed to the User, often by an Agent. It is a group of Needs you, after Review and before Intake, in its own drag order; an unblocked one counts in Needs you, and a blocked one shows with its Blocked marker without counting (ADR 0048). The User finishes one with **Done** in its drawer, offered on a `ready-for-human` Ticket or Epic in Todo or In progress with no Conversation running or waiting on it and not in Review (where Merged is): it applies the completion rule as Merged does, and confirms unchecked criteria the same way. Checking its last acceptance criterion does not finish it. Formerly called For human.
_Avoid_: For human, Waiting on me

**Needs you**:
The Board's first grouping: the Tickets and Epics waiting on the User, which are its groups, in order: those in the Action needed section of the In progress Lane, those in Review, Your work and Intake. Each Board's Needs you holds only its own Tickets: the Backlog's Intake and Your work are on the Backlog's Board, not the Active Cycle's (ADR 0025). `ready-for-human` work is a request, handed to the User, so it counts unless it is blocked (ADR 0048). The Active Cycle's count shows on its tab, and the Backlog's tab badge of open Tickets turns to a warning and names its Intake count, Your work left out, while it has any; a Board's count shows in the browser tab title. These counts ignore the Board filter.
_Avoid_: Action items, attention list

**In flight**:
The Board's second grouping: the Running section of the In progress Lane, one row per Epic or per Ticket outside one, with what its run is doing, how long it has run and what it has cost.
_Avoid_: Active, running list

**Board filter**:
A narrowing of a Board to the Tickets whose title or Ticket number contains a search text and that have every chosen Label. It sits at the top of the Board and narrows every section, and the section counts show the filtered numbers. It only hides Tickets from view: it changes no Ticket, and a hidden Ticket keeps its Status and place. The Needs you count in the tab and the browser title ignores it.
_Avoid_: Search, view, saved filter

**Stats**:
The view of every non-archived Project's figures side by side: per Project, how many Tickets are in Todo and In progress, blocked and claimed, the Active Cycle's progress, and how many were done in the last 7 days. Epics are not counted, since their Status follows their children. A Ticket counts as done in the last 7 days when it is Done now and last reached Done within that window, even if archived since. Below them it shows each Project's **Footprint**, all time and per Cycle, with how many Conversations were not measured.
_Avoid_: Dashboard, report, overview, metrics

**Status**:
Where a Ticket stands: one of a fixed set, **Todo**, **In progress** or **Done**. A Ticket can move between any two Statuses.
_Avoid_: State, stage, column

**Acceptance criterion**:
An optional, independently verifiable condition describing a Ticket's desired outcome. It can be checked off separately; doing so does not change the Ticket's Status. `finish_work` refuses while any is unchecked unless given an `override` reason, which it posts as a comment, and the **Merged** button asks the User to confirm instead (ADR 0043).
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

**Triage proposal**:
What a Triage run recommends for a Todo Ticket, made with `propose_triage`: a category (`bug` or `enhancement`), a state (`ready-for-agent`, `ready-for-human`, `needs-info` or `wontfix`), the reasoning in Markdown, optional acceptance criteria and the run that made it. It is pending until the User decides in the Ticket drawer. Approve sets the category and state labels, swapping the old state label (the User may change either first), and replaces the acceptance criteria when the proposal has some; Reject adds an optional reason as a comment. A newer proposal supersedes a pending one, and decided proposals are kept as a record. Proposing posts the reasoning as a Comment starting with the AI disclaimer. Only the User approves or rejects, in the UI; an Agent never applies the proposal itself. A proposal may instead name the Ticket this one duplicates (`duplicateOf`: on approval it is commented "Duplicate of T#", labelled `wontfix` and archived) or the Tickets to split it into (`splits`: on approval they are filed with it as their Origin, in its Cycle, with the approved category and state, and it is archived); not both, not a duplicate of itself, and an Epic is never split.
_Avoid_: Triage recommendation, triage comment

**Comment**:
A Markdown note on a Ticket that shares progress or context without changing its description. Its author is `user` or `agent`: the UI writes `user`, MCP writes `agent` through `add_note`. Editing or removing a Comment is the User's, in the UI only (ADR 0037).
_Avoid_: Note, reply, update

**Attachment**:
A file the User or an Agent adds to a Ticket, an Epic included, such as a screenshot or a log, kept with the Ticket. It belongs to the Ticket, not to a Comment or the description. Its author is `user` or `agent`, as for a Comment; its name and content never change once added, and two Attachments may share a name. Agents add (`attach`) and read (`read_attachment`) them; removing one destroys it for good and is the User's, in the UI only (ADR 0037). Archiving a Ticket keeps its Attachments; deleting it destroys them.
_Avoid_: File, upload, asset

**Blocker**:
A Ticket that must be resolved before another Ticket can start. A Blocker is resolved once it is Done or Archived, or while it is an In progress sibling in the same Epic as the Ticket it blocks and that Epic is claimed, since the Epic's run works its children on one branch (T828); once the Claim is released the sibling blocks again. A Ticket is **blocked** while any of its Blockers is unresolved, and ready to start when none is. A Ticket cannot block itself, Blockers never form a cycle, and they may cross Projects. Archiving a Ticket keeps its Blockers.
_Avoid_: Dependency, prerequisite, `Blocked by:` lines

**Claim**:
A cooperative marker on a Ticket identifying the Agent run working on it. `start_work` takes it; only one Agent run can hold a Ticket's Claim. `abandon_work` or `open_pr` with `handOff: true` releases it, the User can clear it, and moving the Ticket to Done (`finish_work`) releases it. Claims are not an authorization boundary.
_Avoid_: Lock, reservation

**Agent-run ID**:
A unique identifier for one Agent run, used to claim Tickets independently of its optional display name. Runs Tandembike starts send it in the `X-Tandembike-Run` header, so their tool calls need not pass it; so does a `tandembike start` session, whose `TANDEMBIKE_RUN` the registered header carries, and its calls feed the Ticket's Status line. Any other terminal session passes `agentRunId` itself (ADR 0037, ADR 0039).
_Avoid_: Agent name as the owner identifier

**Conversation**:
An exchange between the User and an Agent that Tandembike starts for them, about one Ticket or, before a Ticket exists, about one Project. It opens with an intent, **Start**, **Triage**, **Batch triage**, **Setup**, **Retro**, **Spec**, **Plan**, **Spar**, **Merge** (started by Approve merge), a free-form **Ask** or **New Ticket**, and continues as the User replies, answers the Agent's **Widgets** and allows or denies what it asks to do. It can span several Agent runs, since an interrupted one is resumed, and it is the Agent-run ID its Agent claims Tickets with. A **New Ticket** Conversation is Project-scoped: the User starts it from a title field, whose Cycle, Epic and type are the Agent's defaults, and the Agent decides what to create. A **Retro** Conversation is Project-scoped too: the User starts it from the Cycle complete banner to look back on one Cycle, which it records apart from the Cycle Autopilot started a Conversation for, so a Retro never counts against the Spend ceiling; a Cycle has at most one, and it stays reachable once the Cycle is archived. A **Spec** Conversation is about one Ticket, an idea in Intake or an Epic without children: the User starts it from the Spec button, never Autopilot, and it runs in the main checkout outside the Start run limit. The Agent grills the User, writes the spec into a new Epic with the idea as its Origin (or into the childless Epic itself) and splits it into `ready-for-agent` Tickets, labelling none until the User approves the breakdown. A **Plan** Conversation is Project-scoped and takes a goal: the User starts it from the Plan button on the Backlog or the Cycles page, never Autopilot, and it runs in the main checkout outside the Start run limit and the Spend ceiling, as a Retro does. The Agent reads the Backlog's `ready-for-agent` work, asks when the goal is ambiguous or not covered, orders the Tickets it picks so Blockers come first and proposes a Prepared Cycle with `create_cycle`; it never starts one. A **Terminal** Conversation is the exception to the rest: the User starts it with `tandembike start` and answers in their terminal, where interactive `claude` runs in its worktree. Tandembike runs nothing for it and it takes no replies, no Stop and no Run outcome; it is In flight while its session is open and `stopped` once the CLI reports the end (ADR 0039). A UI Conversation with an SDK session can become one with **Continue in terminal** (`tandembike resume <id>`), which stops its run and keeps its cost. A Ticket can have several Conversations; the User starts one by sending its first message, or Autopilot starts one in their place (see **Started by**).
A Conversation is **open** until the User closes it, whatever its run is doing; closing stops its run and keeps its transcript.
The User can always reply: their reply is never refused by the Project's Start run limit, whether it goes into an idle run or resumes an interrupted, stopped or closed one. A new Start, and a reply Autopilot sends, stay limited. See ADR 0031. A Start or Merge waiting idle on the User keeps its slot, so a reply into it adds no load; when a turn hands the Ticket off to Review or Done, its process ends and frees the slot, and the Conversation stays open and idle for Approve merge or a reply to resume (ADR 0049).
_Avoid_: Session, run, chat, thread, active Conversation (Active belongs to Cycles)

**Spar**:
A Project-scoped Conversation, optionally about one Ticket or Epic (its focus), in which the User thinks a half-formed idea through with an Agent on the Spar's own page (`/project/<id>/spar/<sparId>`), not in the Conversation dialog. Only the User starts one, from the Spar button or "Spar about this" in the Ticket drawer, with an optional one-line topic; never Autopilot or `tandembike start`. A Spar's id is its Conversation's, and its focus is the Conversation's Ticket, so it is listed among that Ticket's Conversations. It runs read-only whatever the Agent run mode: it reads code and Tickets, asks through Widgets and changes nothing; any command reaches the User as a permission request (ADR 0046). It runs in the main checkout, holds no Machine slot and is never refused a reply, like an Ask. Its Notices and bells open its page. A button bar above its message field sends a move in one click: Challenge me, Diverge, Converge, Summarise and Your move, which hands the turn over with only the Canvas changes. **Close** sends a final Summarise and, once that turn ends, makes the Spar read-only and stops its run; its page still shows the chat, Canvas and Write-up, and it stays listed. **Reopen** makes it editable again, and the next reply resumes its session.
_Avoid_: Brainstorm, session, chat

**Canvas**:
A Spar's shared board of ideas, beside its chat: **Columns** of **Stickies** that the User and the Agent both edit. A new Spar's Canvas starts with the Columns Ideas, Explore, Keep and Park. The User's edits show at once and are saved, but send the Agent nothing; the next message tells it what changed. A refused edit, such as on a closed Spar, puts the Canvas back and says why.
_Avoid_: Board (the Board is the Project's Tickets), whiteboard

**Column**:
An ordered, titled list of Stickies on a Canvas, such as Ideas or Risks. The User or the Agent adds, renames, reorders and removes Columns; one that still holds Stickies cannot be removed until they are moved or removed.
_Avoid_: Lane (a Lane is a Board situation), list

**Sticky**:
One idea on a Canvas: a title, an optional Markdown note, who wrote it (the User or the Agent, shown as a badge), and optionally the Ticket it already has work in. It is dragged within and between Columns, by pointer or keyboard, or moved with its "Move to" menu.
_Avoid_: Card (a card is a Ticket on the Board), note

**Write-up**:
The outcome of a Spar, beside its Canvas: three Markdown sections, **Decisions**, **Open questions** and **Next steps**, that build up as the Spar goes. The Agent updates it with `update_write_up`, and does so on Summarise and on Close; the User edits it in place.
_Avoid_: Summary, notes, minutes

**Hand-off**:
How an agreed Spar becomes work: **We agree** asks the Agent for a draft idea Ticket (title, a description built from the Write-up, and a recommended path), which it gives with `propose_hand_off`; it may also propose one unprompted. The draft shows as the Hand-off card on the Spar page, where the User edits it and approves **File as Ticket** (into the Backlog's Intake, triaged as usual) or **Spec it** (filed, then a Spec Conversation starts on it). The new Ticket's description ends with a link back to the Spar, its Origin is the Spar's focus Ticket when it has one, and the Spar records it as its outcome. Only the User's approval files it; a Spar's Agent never creates a Ticket.
_Avoid_: Export, conversion

**Widget**:
A typed question an Agent asks the User through a tool, which the chat shows as a control of its kind and which blocks the run until the User answers: **choice** cards (one or several, the Agent's recommendation preselected), a **rank** list, a 2×2 **matrix** and **scale** sliders. Every Widget also takes **Other…** with free text and **Skip**; a run that ends first expires it. A waiting Widget makes its Conversation `waiting` and raises the `waiting` Notice, as a permission request does. Widgets work in every Conversation the server runs, whatever its Agent kind; on Claude Code runs, AskUserQuestion shows as choice cards too (ADR 0045, ADR 0051).
_Avoid_: Form, prompt, question (for the typed control)

**Autopilot**:
A Project switch, off by default, that makes Tandembike start Start Conversations for the Active Cycle's **Eligible** work by itself, in the Cycle Board's Todo order, up to the Project's free Start run slots. It needs a Spend ceiling to be turned on, stays on across restarts, and is not turned on by starting a Cycle. Turning it off stops new dispatches and leaves running runs alone. A Start waiting on the User in Action needed keeps its slot, so Autopilot starts nothing in its place until the User answers, closes or stops it, or the Ticket goes Back to Todo (ADR 0049). A User's reply that resumes an interrupted run can take the Project over its Start run limit; Autopilot then dispatches nothing until the slot holders drop below it (ADR 0031). It resumes a Start Conversation once after a transient end (API overload, rate limit or network error), a minute later and within the run limit and Spend ceiling, and retries nothing else (ADR 0034); it never changes a Ticket's Status or labels. One machine-wide pass over every unarchived Project runs the evaluation, serialised and shared, within the free **Machine slots**, the cap minus every live Agent process, the User's own runs and open Terminal Conversations included (ADR 0049), and every Project's own limits, shares those slots round-robin: each turn offers every Project one run, a build before a triage, and a pass starts after the Project served last (ADR 0041). The evaluation also starts Triage runs when **Auto-triage** is on, with or without an Active Cycle, which Autopilot's own switch does not control (ADR 0040). Only the User sets it, through a Server Action, and it is not part of the Project the MCP tools show. See ADR 0030, ADR 0034, ADR 0040 and ADR 0041. Why it starts nothing now are its **Pause reasons**, shown on **Flow** (ADR 0044).
_Avoid_: Auto mode (that is the Agent run mode), scheduler, Copilot's autopilot (a Copilot mode Tandembike never uses, ADR 0051)

**Pause reason**:
Why Autopilot or Auto-triage starts nothing right now, as Autopilot's own rule answers it (`explain`, ADR 0044). Autopilot's are: the Project is archived, switched off, no Active Cycle, no Spend ceiling, over the Spend ceiling, no free Start run slot, the Machine cap full (naming how many of its runs wait on the User, so unanswered Action needed runs show as what stalls the factory, ADR 0049), over the Machine ceiling, and no Eligible work. Auto-triage's are: switched off, no Triage ceiling, over the Triage ceiling, a Triage run already working, the Machine cap full, over the Machine ceiling, and no Triage-eligible work. Every reason that holds is named; "no Eligible work" and "no Triage-eligible work" only when nothing else does. **Flow** lists them and the Ticket drawer adds them to its explanation.
_Avoid_: Blocker (that is a Ticket another waits on), error

**Flow**:
A Project's tab, beside Board, Cycles and Settings, that explains how its factory runs: the Ticket path from New Ticket to Done with the Board's live counts, the Cycle loop with the Project's Cycles, its setup (each Stage's command, the Check and Prepare commands, the Agent run mode and run model, the ceilings with their spend), the Autopilot and Auto-triage switches and the current **Pause reasons**. It is built from the same rule that runs Autopilot, so it cannot disagree with it; the switches are the only settings it changes. See ADR 0044.
_Avoid_: Pipeline, workflow (that is a Claude Code feature), dashboard

**Auto-triage**:
A Project switch, separate from **Autopilot** and off by default, that makes Autopilot's evaluation start a Triage Conversation, Started by Autopilot, on the oldest **Triage-eligible** Ticket. It needs no Active Cycle, covers the Backlog and every Cycle, and works one Triage run at a time per Project in the main checkout, outside the Start run limit. It needs a **Triage ceiling** to be turned on, starts the run on the Project's triage model when set, and stops starting runs when switched off, leaving a running one to finish. Every run of an Autopilot-started Triage Conversation, the User's replies included, may not use `update_ticket` or `file_tickets`, so its only writes are a triage proposal and a note; the User approves every proposal. See ADR 0040.
_Avoid_: Auto mode, auto-approve

**Triage-eligible**:
Work Auto-triage may triage: a Ticket or Epic that is Todo and not archived, labelled `needs-triage` or with no triage state label, with no source label (`from:agent-run`, `from:tandembike`), no open Triage Conversation (any unhidden one, in any state, so a run that ends without a proposal holds its Ticket until the User closes the Conversation), not listed in an open **Batch triage** (held the same way, until the User closes it) and no triage proposal since its latest change into its current state. Setting a Ticket back to `needs-triage` makes it eligible again. Auto-triage takes them oldest first. Why a Ticket is not, or where it is in line, comes from Autopilot's `explain` and shows in the Ticket drawer; why Auto-triage starts none now are its **Pause reasons**, on **Flow** (ADR 0044).

**Batch triage**:
A Conversation intent about one Board, the Active Cycle's, a Prepared Cycle's or the Backlog's, in which one Agent run triages the Board's Intake and ends each Ticket in a triage proposal. The User starts it with **Triage N** on the Board's header, N being the Board's **Triage-eligible** Tickets and Epics (so never `needs-info`), hidden at 0; Autopilot never starts one. Pressing it records those Ticket numbers, oldest first, on the Conversation and names them in its first message: the list is fixed, and the Agent re-reads each Ticket before proposing and skips one no longer eligible. It may propose a duplicate or splits, between listed Tickets too. A Board has at most one open: pressing the button while one is open opens it, and closing it lets the button start a new one. While it is open every listed Ticket is held from Auto-triage, as by its own Triage Conversation; each listed Ticket's drawer links to it, and its Board row shows the run while it works. Every run of it, the User's replies included, may not use `update_ticket` or `file_tickets`. It runs in the main checkout on the Project's triage model when set, outside the Start run limit, the Machine cap, the Spend ceiling and the Triage ceiling. See ADR 0047.
_Avoid_: Bulk triage, triage all

**Triage ceiling**:
A Project setting in dollars per local calendar day, with no default, that bounds Auto-triage; it cannot be turned on without one. Today's triage spend is the cost of the Triage runs Autopilot started that ended today, from Run outcomes, plus the cost so far of one still working. At or over the ceiling Auto-triage starts nothing, the switch stays on and a running run finishes; it starts again the next day or when the ceiling is raised. The Backlog Board's header shows the spend against the ceiling and "triage paused: over ceiling" while paused. Triage runs record no Cycle, so they never count against the **Spend ceiling**.

**Check command**:
A Project's command that defines green for its repository, such as `npm run check`. A Start run's brief names it as what must pass before the run opens a pull request; with none set, the brief tells the run to follow the repository's own instructions. Only the User sets it, through a Server Action, and it is not part of the Project the MCP tools show, so no Agent can redefine green for itself.
_Avoid_: Test command, build command

**Prepare command**:
A Project's command, such as `npm ci`, that Tandembike runs through the User's shell in each new worktree before the run starts, so the run finds its dependencies ready. When it exits non-zero no run starts: its output goes into the transcript as an error entry and the Conversation is interrupted, so its Ticket shows in Action needed. With none set, the run starts right after the worktree is created. Only the User sets it, through a Server Action, and it is not part of the Project the MCP tools show, so no Agent can make Tandembike run a command of its choosing.
_Avoid_: Setup command, install command

**Eligible**:
Work Autopilot may start: a Ticket or Epic in the Active Cycle that is Todo, labelled `ready-for-agent`, not blocked, unclaimed, not archived and not an Epic's child, an Epic only once it has a child, and with no open Start Conversation on it, whatever state its run is in, so a failed run waits for the User. A Start Conversation from before the Ticket's latest move to Todo, such as Back to Todo, no longer counts, unless its run is still working. Why a Ticket is not Eligible, or its place in line, comes from Autopilot's `explain` and shows in the Ticket drawer; why Autopilot starts nothing now are its **Pause reasons**, on **Flow** (ADR 0044).
_Avoid_: Ready (that is the label), startable

**Started by**:
Who started a Conversation: the **User**, **Autopilot**, or **Terminal**, the User's `tandembike start` in a terminal (ADR 0039). Autopilot starts Start Conversations and, with Auto-triage on, Triage Conversations (ADR 0040). Every Conversation records it and its header shows it; Conversations from before it was recorded read the User. A reply is sent by the User or by Autopilot too, and a transcript shows an Autopilot message as sent by Autopilot, apart from the User's.
_Avoid_: Owner, author, initiator

**Notice**:
Something the User should look at while they are away: a run that starts waiting on a permission or a **Widget** (`waiting`), a Start or Merge run that ends needing a reply or failing on a substantive error (`needs_reply`), or an Agent completing a Ticket or Epic through **Auto-merge** (`auto_merged`), among others. The Notices module computes the machine-wide set after every change and raises a Notice, as a `notice` change on the events connection, once for each key that is new; the set at server start raises nothing. A browser shows it as a notification only when the User opted in in that browser, permission is granted and the tab is hidden or the window unfocused; a click opens its Conversation. See ADR 0042.
_Avoid_: Alert, push notification, toast

**Run outcome**:
The record a Conversation's run leaves when it ends: a turn result, an exit or the User's stop. It holds the Conversation, Project and Ticket, the Stage (the Conversation's intent), the result, when the run started and ended, what it cost, the model, the command its first message started with and whether Autopilot started it. The result is the first that matches: `stopped` (the User stopped it), `failed_transient` or `failed` (the end carries an error; transient means an API overload, rate limit, 5xx or network error, everything else is substantive), `completed` (the Ticket is Done), `pr_open` (the Ticket has a PR reference), `abandoned` (a Start whose Ticket is Todo), `completed` (a Triage, Batch triage, Spec, Plan, Retro, Ask, New Ticket or Setup run that ends with no permission request or Widget unanswered: these Stages never end in Done or a PR, so a clean end is their completion), else `needs_reply`. So a Start, Merge or Spar run left In progress without a PR, or any run that ends waiting on the User, is `needs_reply`. Only the Conversations module writes and reads Run outcomes, never an MCP tool, so no Agent can shape its own statistics, and the Estimate reads them; they stay when a Conversation is closed. The Stats page shows them per Project and Stage over the last 30 days. A Conversation Started by Terminal records none: Tandembike sees no result, cost or model of an interactive session (ADR 0039).
_Avoid_: Run result, run log

**Plan**:
The Stage that proposes a Cycle toward a goal (`/tandembike:plan <goal>`). A Plan Conversation reads the triaged Backlog, orders what it picks by Blockers and proposes a Prepared Cycle with `create_cycle`, which never starts it: there is no separate `propose_cycle` tool. Its brief gives the per-Ticket Estimate, or says there are not enough runs to estimate. The User reviews the Prepared Cycle and starts it; planning by hand stays.
_Avoid_: Auto-plan, planner

**Estimate**:
What a Prepared Cycle should cost, worked out from Run outcomes and shown on its Board header as "Estimated ≈ $X for N Tickets". The per-Ticket figure is the median cost of the Project's last 20 Start Conversations, by when their latest run ended, that reached `completed` or `pr_open`, however old; each Conversation's cost sums its runs, so a resumed one counts once. With fewer than 5 such Conversations there is none, and the header says "Not enough runs to estimate". N counts each Ticket as 1 and each Epic as its unarchived, not-Done children planned in the Cycle, or 1 when it has none. Agents never read it through MCP.
_Avoid_: Budget, forecast

**Footprint**:
The estimated energy (Wh) and CO₂e of a Conversation's runs, worked out from the tokens it recorded per model (input, output, cache write, cache read) and the app-wide **Footprint factors**: Wh per 1M output tokens for each of Haiku, Sonnet and Opus, and the grid intensity in gCO₂e/kWh, set on the Settings page. It is always shown as an estimate ("~12 Wh · ~4 g CO₂e est.") next to the cost in the chat header and the Ticket's Conversation list, as totals per Project and per Cycle on the Stats page, and as the whole Cycle's Footprint, labelled "Cycle:", on the Active Cycle's Autopilot bar, counting every Conversation of the Cycle as Stats does. A dotted underline marks its tooltip, which lists five fixed everyday comparisons in this order, each "≈ N" at one significant figure: phone charges, hours of an LED bulb, kettles boiled and days of an EU household's electricity from the energy, km by petrol car from the CO₂e. A Conversation that recorded no tokens is **not measured** and left out of totals. It is information only: it never pauses Autopilot or limits anything. See ADR 0050.
_Avoid_: Carbon cost, emissions (it is an estimate, not a measurement)

**Spend ceiling**:
A Project setting in dollars, with no default, that bounds what Autopilot spends in one Cycle; Autopilot cannot be turned on without one. The spend is the total cost of the Conversations Autopilot started for that Cycle, resumes included; each Conversation records the Cycle it was started for, so it resets with each Cycle and hand-started runs do not count. It does not bound Auto-triage, which has its own **Triage ceiling**, and the **Machine ceiling** bounds all of Autopilot's spend across Projects on top of it. At or over the ceiling Autopilot dispatches nothing new, the switch stays on and running runs finish; raising the ceiling or starting the next Cycle resumes dispatch. The Active Cycle's Board header shows the spend against the ceiling and "paused: over ceiling" with the amount while paused.
_Avoid_: Budget, cap (that is the run cap), limit

**Machine ceiling**:
An optional machine-wide setting in dollars per local calendar day, set on the Settings page, that bounds what Autopilot spends across all Projects. Today's spend is the cost of the Autopilot-started runs that ended today, from Run outcomes, plus the cost so far of those still working, read by the Conversations module's `autopilotSpendToday(dayStart)`; a Merge the User approved and the User's own runs are left out. At or over it Autopilot's pass starts and resumes nothing in any Project, the switches stay on and running runs finish; it goes on the next local day or when the ceiling is raised. The app header shows "Spend $X/$Y" and "paused: machine ceiling" while paused, and Autopilot exposes the pause state (`machineBudget()`) for Notices. It applies on top of each Project's **Spend ceiling** and **Triage ceiling**. Only the User sets it, through a Server Action; no MCP tool exposes it. See ADR 0041.
_Avoid_: Budget, Spend ceiling (that is the per-Project, per-Cycle one)

**Machine cap**:
A machine-wide setting, default 3 and at least 1, for the most **Machine slots** held at once across all Projects, set on the Settings page; the app header shows the live Agent processes Autopilot's headroom counts (see **Run capacity**), split into those working and those waiting on the User, against it ("Runs 1 working · 2 waiting on you / 3"), and updates live. It is the one number for load: a Project has no run count of its own, and its Start run limit is one Start or Merge with **Parallel runs** off, the Machine cap with it on (ADR 0049). A Start or Approve merge is refused at the cap, naming it and the Conversations holding the slots, marking those waiting on the User; a reply never is (ADR 0031). A reply into an idle run uses the slot it holds; only one that resumes an interrupted run can go over the cap, after which Autopilot dispatches nothing until the slot holders drop below it (ADR 0049). Only the User sets it, through a Server Action; no MCP tool exposes it. See ADR 0041.

**Machine slot**:
What a live Agent process holds against the **Machine cap**: a Start or a Merge whose run is `running`, `waiting` or `idle` (waiting on the User's reply), or a working Triage Autopilot started, not Terminal. An `interrupted` run has no process and holds none, and a Start whose turn handed its Ticket off to Review or Done ends its process and frees its slot (ADR 0049). The User's own interactive Conversations (Ask, Spec, Plan, Spar, Setup, Retro, New Ticket, Batch triage and a Triage they start) and Terminal Conversations hold none, so the cap never refuses them. Refusals count the holders. Autopilot's headroom is wider on purpose: the cap minus every live Agent process, the slot holders plus the User's own live runs (idle ones included, until closed) and open Terminal Conversations. **Run capacity** gives both. See ADR 0041 and ADR 0049.

**Run capacity**:
Whether another run may start now and why not: a Project's Start run slots, the Machine slots, the live Agent processes Autopilot's headroom counts, and Auto-triage's one working Triage run, with who holds each. One module decides it (`src/conversations/capacity.ts`), from a snapshot of the live Conversations, Terminal ones included: a refused Start or Approve merge, Autopilot's Pause reasons, the Board header's run slots and the app header's runs all read the same numbers and verdict (ADR 0044).

**Draft**:
A Conversation the User has begun but not yet sent: an intent, its Ticket or Project, and the text typed so far, with a New Ticket draft also holding its title field's defaults. Nothing runs until the User sends it, which starts the Conversation. A Draft lives only in the browser tab: a reload loses it, and closing it discards it.
_Avoid_: Pending Conversation, unsent Conversation

**Setup**:
A Conversation about a Project in which the Agent checks that the Project's repository has what Tandembike's Agent runs rely on, and offers to add what is missing. It is advisory: it never stops the User from using agent mode, and the User can hold it again at any time.
_Avoid_: First-time setup, onboarding, readiness check

**Agent run mode**:
A Project setting, `default` or `auto`, that every run the Project starts uses as its permission mode, whoever starts it. `default` asks the User about every call the repository has not allowed; `auto` approves what the agent's own judge allows and asks about the rest: Claude Code's permission classifier, or Copilot's Assisted permissions. A run whose Agent kind lacks the mode runs in `default` and says so (ADR 0051). New Projects are `auto`; existing Projects keep their mode. Only the User sets it, through a Server Action, and it is not part of the Project the MCP tools show. The Project also has a run model per Agent kind, the model its runs start on, blank for that agent's own default. See ADR 0029.
_Avoid_: Permission level, trust mode

**Playbook**:
Tandembike's own agent plugin, named `tandembike`, bundled with the app and loaded into every run, whatever its Agent kind: Claude Code loads it as a plugin, and so does Copilot (ADR 0051). It has one skill per **Stage**, written to work in any repository and to use only Tandembike's workflow tools. It keeps the MIT notice of `mattpocock-skills`, which its skills are adapted from, and has a `version` that is bumped whenever its files change. On Claude Code runs, a Project's **Agent command** overrides it for one Stage. See ADR 0032.
_Avoid_: Default skills, process, built-in prompts

**Merge gate**:
The point where a Ticket or Epic in Review, whose PR the Agent reviewed and opened, waits for the User's **Approve merge** in its drawer. The click resumes the Start Conversation if it is open, or starts a **Merge** Conversation in a worktree; that run waits for green checks, merges the default branch into the PR branch when behind (rebasing only where force pushes are allowed), merges through the host CLI and calls `finish_work`, or comments why and stops. With **Auto-merge** off a run never merges its own PR; with it on, a run stops here only when it cannot meet the merge conditions. Autopilot never approves, and an approved merge stays outside the Spend ceiling and counts against the Start run limit. **Merged** stays for a PR the User merged by hand; when acceptance criteria are unchecked it lists them and completes only once the User confirms, recording the override. See ADR 0038 and ADR 0043.
_Avoid_: Auto-merge (that is the setting that skips the gate), merge button (for Approve merge)

**Auto-merge**:
A Project agent setting, off by default and independent of Autopilot, that lets the run that opened a PR merge it. Every Agent run in the Project learns it from `start_work`'s `merge` (`"auto"` or `"approve"`), which the Claim keeps, so switching it affects only later runs. With `auto` the run merges only when the Check command passes, its review has no unresolved findings, every acceptance criterion is checked (or a comment says why not) and the checks are green, by the `merge` skill's steps, then calls `finish_work`; otherwise it comments why and hands off to the **Merge gate**. It never pushes to the default branch, its cost counts against the Spend ceiling with its run, and each auto-merge raises a Notice naming the Ticket and its PR. Only the User sets it, through a Server Action; no MCP tool exposes it. See ADR 0043.
_Avoid_: Self-merge, auto mode (that is the Agent run mode)

**Stage**:
One step of the flow that a Playbook skill, or on Claude Code runs an Agent command, runs: Triage, Start (`implement`), Start on an Epic (`implement-epic`), Retro, Spec (`spec`), Plan (`plan`), Spar (`spar`) and Merge (`merge`), with more to come. Each Stage has one Agent command field and one skill; its command is the Project's when set, otherwise `/tandembike:<skill>`, and no Stage falls back to another's command.
_Avoid_: Step, phase, workflow

**Agent command**:
A Claude Code command that a Stage sends as the first message of a Claude Code run, followed by the Ticket number, by the Cycle for a Retro, or by the goal for a Plan, such as `/tandembike:implement T42`. A Project has a **Triage command**, a **Start command**, a **Start command for Epics**, a **Retro command**, a **Spec command**, a **Plan command**, a **Spar command** and a **Merge command**. A blank one sends the Playbook's command for its Stage, always namespaced, so a new Project works without settings; one the User sets replaces it for that Stage only, so a repository keeps its own skills. The Retro command is followed by the Cycle's title and id (`/tandembike:retro "Factory p2" (Cycle 44)`), the Plan command by the goal (`/tandembike:plan Ship the beta`), and the Spar command by the topic in quotes and the focus Ticket, each when there is one (`/tandembike:spar "Faster triage" T42`). Only the User sets them, on the Project's Settings, where each blank field shows the Playbook command it runs; Tandembike does not check that an override's skill exists. Overrides apply to Claude Code runs only; a Copilot run always runs the Playbook's skill for its Stage (ADR 0051).
_Avoid_: Triage skill, Start skill, preset

**Activity**:
A Ticket's record of the changes made to it, one **Activity entry** per action. Each entry lists every change the action made, when, and whether the User or an Agent made it. Comments are not Activity entries; they appear beside them.
_Avoid_: History, event, audit log, changelog

**Archived**:
A Ticket or Project taken out of the normal views without being destroyed; it can be restored. An archived Project hides its Tickets and keeps them, and itself, read-only until it is restored; only the User archives a Project. An archived Ticket is read-only too: its fields, Status, labels, External references, acceptance criteria, Blockers, Epic and Cycle cannot change and it cannot be claimed until it is restored, but it can still be restored, take comments and Attachments, have its Claim released or cleared, and be deleted. Archiving keeps a Claim; `abandon_work` on an archived Ticket comments and releases it but leaves the Status as it is. An Epic is archived only once its children are: the User can archive it with its children in one step, and restoring it brings back the children archived with it, not ones archived before. Archiving a Cycle leaves its Epics and their children as they are.
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

**Agent kind**:
Which coding agent a Conversation runs on: **Claude Code** or **Copilot** (GitHub Copilot). Each Conversation keeps its Agent kind for life, so replies, resume and Stop always reach the same agent. Each Project has a default Agent kind, which Autopilot always uses and manual starts offer first. Only the User sets the default, and changing it is never refused. Costs are in each kind's own unit, dollars for Claude Code and AI credits for Copilot, and are never added up across kinds. Copilot's own **autopilot** mode is not Tandembike's **Autopilot** and is never used. See ADR 0051.
_Avoid_: Agent type, provider, model (that is what an agent runs on)
