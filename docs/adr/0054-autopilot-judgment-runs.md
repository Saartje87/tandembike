# Autopilot's judgment runs: Overlap planning and Auto-reply

Decided on 2026-11-18 with the User for Epic T1662 (T1663, T1664). Amends [ADR 0030](0030-autopilot-dispatches-the-active-cycles-ready-work.md) and [ADR 0040](0040-autopilot-triages.md), and revisits `.out-of-scope/orchestrator-agent.md`.

While an Active Cycle runs on Autopilot, two things still need the User. Two Eligible Tickets that touch the same code run in parallel, and the second PR hits conflicts. A Start run that asks a question waits in Action needed, keeping its slot, when the answer is usually "go with your recommendation" or "leave it for a follow-up".

The out-of-scope note keeps Autopilot the only dispatcher, and allows judgment only as "a short run started at a defined point, as Triage runs are". Its "When to revisit" thresholds (over 3 waiting Start runs a month; collisions over 10% of PRs) are not shown to be met. The User chose to build anyway: the waiting and the catch-up merges cost the User attention every Cycle, and both runs fit the shape the note allows. This ADR records that the thresholds were waived, not met.

## Decision

A **judgment run** is a short Conversation that Autopilot's evaluation starts at a defined trigger. It decides one thing and acts only through a tool made for that decision. Two exist: **Overlap planning** and **Auto-reply**.

- **Started only by Autopilot.** The intents `overlap_planning` and `auto_reply` refuse any other starter. A judgment run starts no run, resumes none and dispatches nothing. Autopilot stays the only dispatcher. The one run that goes on because of a judgment run is the Start whose Widget Auto-reply answered, as it would on the User's answer.
- **Their own switches.** `overlapPlanning` and `autoReply` are Project agent settings, off by default and set only by the User through a Server Action, as Auto-triage's is. They need no ceiling of their own and do not need Autopilot on.
- **Capacity.** A working judgment run holds a Machine slot, as an Autopilot-started Triage does, and runs outside the Start run limit. Otherwise the Start waiting on the User holds the Project's only Start slot (ADR 0049), and the Auto-reply that would free it could never start. One judgment run of each kind works per Project at a time.
- **Spend.** A judgment run records the Active Cycle as the Cycle Autopilot started it for. Its cost counts against that Cycle's Spend ceiling and against the Machine ceiling, as a Start's does. They pause on the same Pause reasons as Autopilot: archived, switched off, no Active Cycle, no Spend ceiling, over the Spend ceiling, Machine cap full, over the Machine ceiling. They add their own: a run of the kind already working, and nothing to do.
- **Restricted runs.** Every run of a judgment Conversation runs under the `judgment` tool policy: no file edits, no Tandembike tool that writes (`file_tickets`, `update_ticket`, `add_note` and the rest), and no Widget. Its only write is its own tool, which refuses any caller but a run of its intent: `add_overlap_blocker` for Overlap planning, `reply_to_question` for Auto-reply. The tool enforces the rules, so a judgment run cannot break them. Judgment runs work in the main checkout and read code only.
- **Shown on Flow.** Both switches and their Pause reasons. A working run is named in its "already working" reason and among the runs a full Machine cap counts. The Reply rules show under Auto-reply's switch. What a run did shows as a comment on the Ticket.

### Overlap planning

- **Trigger.** The Active Cycle starts, a Ticket is planned or created into it, or a Ticket of it gets `ready-for-agent`. Nothing records when a Cycle started, so a Cycle with no Overlap planning Conversation yet is due at once. Starting a Cycle, or turning the switch on mid-Cycle, plans it once. After that, planning is due when a candidate's Activity shows a later trigger than the last run's start. It starts 30 seconds after the latest trigger, so planning a batch starts one run. It is never due with fewer than two candidates.
- **Autopilot waits for it.** While planning is due, settling or working, Autopilot starts no build in the Project (Pause reason "Overlap planning first"), so nothing it would block starts first.
- **Candidates.** Tickets and Epics of the Active Cycle that are Todo, unclaimed, not archived, not an Epic's child (an Epic is compared as a whole) and labelled `ready-for-agent`, in Board order.
- **`add_overlap_blocker`.** It adds one native Blocker between two candidates, the one higher on the Board first, and a comment on the blocked Ticket naming the other and the shared code. It refuses a pair that is not two candidates, the wrong order, and a Blocker cycle. It never removes a Blocker or changes Status, labels or order. Blockers it added are not revisited when a description changes.

### Auto-reply

- **Trigger.** An unanswered Widget (ADR 0045) of a live Start Conversation whose Ticket is in the Active Cycle. Each Widget gets at most one Auto-reply Conversation, which records it. Plain-text questions, permission requests and Hand-off proposals stay with the User. The Start run brief tells the Agent to ask every question to the User as a Widget.
- **Three answers, through `reply_to_question`.**
  - **Approve** answers the Widget with the recommended option, or the one within scope. Only when it adds, drops or changes no acceptance criterion and the Reply rules do not reserve that kind of choice for the User.
  - **Split** answers it with Other, telling the Start to leave the matter out and file a follow-up through its own feedback step, with its Ticket as Origin. It counts toward that run's feedback cap.
  - **Escalate** leaves the Widget for the User. It adds a comment on the Ticket giving the reason.
- **Reply rules.** A free-text Project setting, edited in Settings and shown on Flow, that the run follows on top of these defaults. Only the User edits it.
- **Marked as Auto-reply's.** The Widget's answer records the Auto-reply Conversation and its decision. The Start's transcript gets a note saying Auto-reply answered, and the Ticket gets a comment. When the User answers first, the tool is refused, and nothing is sent.
- **The follow-up is checked.** A Split answer is recorded on the Widget. When the Start's run is no longer working, a Ticket with that Origin filed after the answer marks it filed. Otherwise Tandembike adds a comment on the Ticket and the `split_follow_up` Notice tells the User.

## No Ticket creation

The out-of-scope note says an orchestrator "stays out of triage and Ticket creation". Judgment runs keep to that: neither may file a Ticket. Auto-reply's Split only asks the Start run to file one, by its own feedback step. Overlap planning adds Blockers and comments, which the User can remove.

## Considered Options

- **A long-lived orchestrator.** Still out of scope, for the note's reasons.
- **Auto-reply files the follow-up itself.** That would cross "stays out of Ticket creation". The Start run knows the context best, and Tandembike checks that it did.
- **Count judgment runs as Start runs.** That deadlocks Auto-reply with Parallel runs off.
- **Let the runs use `update_ticket` and `add_note`.** A prompt would then be the only guard on removing Blockers or changing labels. A dedicated tool enforces the rules.
- **Read questions from the transcript.** Guessing whether plain text is a question is unreliable. A Widget is a typed, checked question.

## Consequences

- `ConversationIntent` gains `overlap_planning` and `auto_reply`. `holdsMachineSlot` counts them while they work.
- Autopilot's `explain` gains `overlapPlanning` and `autoReply` engine states.
- A Split's follow-up check writes a comment, so it lives in its own small watcher next to Autopilot. Autopilot still writes no Ticket. A follow-up filed after the check marked it missing, by a run resumed later, settles it as filed.
- A judgment run needs a free Machine slot like any run Autopilot starts. With the Machine cap full of Starts that all wait on the User, no Auto-reply starts, and Flow names the Machine cap as its Pause reason. Raising the cap leaves room for it.
- An Overlap planning run that fails to start counts as the Cycle's last attempt, kept in memory: builds go on, and the next trigger plans again.
