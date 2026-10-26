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
A goal-led set of Tickets within one Project, not defined by a fixed duration. A Cycle is Prepared, Active, or Archived; a Project may have multiple Prepared Cycles but at most one Active Cycle, and a Ticket can be planned in only one non-archived Cycle at a time.
_Avoid_: Sprint

**Backlog**:
A Project's Tickets that are in no Prepared or Active Cycle, the work not yet planned. An Archived Cycle's unfinished Tickets leave it and return here as it is archived; its Done Tickets stay with it and are not in the Backlog.
_Avoid_: Inbox, unplanned list

**Epic**:
A Ticket, fixed as such when created, that groups child Tickets of the same Project so they can be handed off as one unit. A Ticket belongs to at most one Epic, and an Epic cannot be a child. An Epic's Status is always derived from its children, and claiming it covers them. Every Epic has a colour, from a fixed set, that marks its children so related Tickets stand out.
_Avoid_: Feature, parent Ticket, story

**Origin**:
The Ticket another Ticket was split from, such as the spec a build Ticket came out of. A Ticket has at most one Origin, possibly in another Project; the Tickets split from one Origin form a group whose members are each worked on their own. It records provenance only: it does not affect Status, Claims or Blockers.
_Avoid_: Parent, source, spec link

**Board**:
The view of one Project's Tickets, laid out in one column per Status. Epics are not in the columns; the Board lists them apart, with their progress.
_Avoid_: Kanban, dashboard, list

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
A URL or key, such as `#55` or `ABC-33`, that points to the same work in another system, such as a GitHub issue or pull request or a Jira issue. A Ticket can have any number of them, each at most once, and the User or an Agent can add or remove them. Several Tickets may point to the same work.
_Avoid_: External link, external ID, URL, link

**Reference template**:
A Project's rule that turns External reference keys starting with a given prefix, such as `#` or `ABC-`, into a URL, so they open as links. A Project can have several; the first whose prefix matches applies. Only the User manages them. A key keeps its text, and is linked by the templates of whichever Project its Ticket is in.
_Avoid_: Link template, URL pattern

**Comment**:
A Markdown note on a Ticket that shares progress or context without changing its description. Its author is `user` or `agent`: the UI writes `user`, MCP writes `agent`.
_Avoid_: Note, reply, update

**Blocker**:
A Ticket that must be resolved before another Ticket can start. A Blocker is resolved once it is Done or Archived; a Ticket is **blocked** while any of its Blockers is unresolved, and ready to start when none is. A Ticket cannot block itself, Blockers never form a cycle, and they may cross Projects. Archiving a Ticket keeps its Blockers.
_Avoid_: Dependency, prerequisite, `Blocked by:` lines

**Claim**:
A cooperative marker on a Ticket identifying the Agent run working on it. Only one Agent run can hold a Ticket's Claim; that Agent run can release it, the User can clear it, and moving the Ticket to Done releases it. Claims are not an authorization boundary.
_Avoid_: Lock, reservation

**Agent-run ID**:
A unique identifier for one Agent run, used to claim Tickets independently of its optional display name.
_Avoid_: Agent name as the owner identifier

**Activity**:
A Ticket's record of the changes made to it, one **Activity entry** per action. Each entry lists every change the action made, when, and whether the User or an Agent made it. Comments are not Activity entries; they appear beside them.
_Avoid_: History, event, audit log, changelog

**Archived**:
A Ticket or Project taken out of the normal views without being destroyed; it can be restored. An archived Project hides its Tickets and keeps them, and itself, read-only until it is restored; only the User archives a Project. An Epic is archived only once its children are: the User can archive it with its children in one step, and restoring it brings back the children archived with it, not ones archived before.
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
