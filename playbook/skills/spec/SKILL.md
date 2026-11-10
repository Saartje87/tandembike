---
name: spec
description: "Turn a Tandembike idea Ticket, or an Epic without children, into a spec and its build Tickets, together with the User: grill a round at a time, check the test seams, then publish after the User approves the breakdown."
disable-model-invocation: true
---

Adapted from the `to-spec` and `to-tickets` skills of `mattpocock-skills` (MIT, see the plugin's LICENSE).

The User started this Conversation to turn the Ticket the first message names, such as `T42`, into a spec and the Tickets that build it. Unlike an implementation run you work with the User here: they answer in this Conversation, so ask, wait, and carry on from what they say. Everything about the Ticket comes from the Tandembike tools; everything about the repository comes from its own instructions (`CLAUDE.md` or `AGENTS.md`, if it has them), its glossary and ADRs, if any, and its code.

You never apply the `ready-for-agent` label, and you never create a Ticket that has it, until the User has approved the breakdown in this Conversation (step 6). Until then you only read, ask and draft.

## 1. Read the Ticket

Call `get_ticket` with the number, with its comments. Note the time now, in UTC (`date -u +%Y-%m-%dT%H:%M:%SZ`): it is when this session started reading the tracker, and step 7 needs it.

- A Ticket that is an Epic with no children is a placeholder: it becomes the spec itself (step 7). Any other Ticket is an idea: the spec becomes a new Epic with the idea as its Origin.
- If the Ticket is an Epic with children, or is not Todo, say so and stop.

State what you understand the idea to be in two or three sentences, using the repository's own vocabulary.

## 2. Explore

Read the code, glossary and ADRs around the idea so you ask about what the code cannot tell you. Use `find_tickets` to see whether the Project already has Tickets or Epics about the same thing, and `get_project` for its labels and Cycles. Respect the decisions already recorded in the area.

## 3. Grill the User, a round at a time

Interview the User about the idea until you share an understanding of it. Ask one round of at most three questions, each with your recommended answer, then stop and wait. Do not send the next round before the answer comes. Where the code can answer a question, read it instead of asking.

Ask each question that has sensible options with the `ask_choice` Widget tool: the options as choice cards, your recommended answer in `recommended`, so the User agrees with one click. It waits for the answer and returns `{ "selected": [...] }`, `{ "other": "..." }` when the User wrote their own, or `{ "skipped": true }`; a skip is not agreement, so ask again or leave the point open. Use `ask_rank` when the question is an order of priorities. Ask in text only an open question with no sensible options. Where the Widget tools are missing, such as in a terminal, ask the same with AskUserQuestion, or in text.

Walk down the branches of the design: who it is for, what changes for them, edge cases, what stays out, and how it fits what exists. Stop when another round would not change the spec.

## 4. Check the test seams

Sketch the seams at which the feature will be tested. Prefer existing seams to new ones and the highest seam you can; the fewer seams, the better, and one is ideal. Check in one question that the User agrees with them, with `ask_choice` where you can, and wait for the answer before drafting.

## 5. Draft the spec

Write the spec in the template below. Use the repository's glossary vocabulary. Do not name specific file paths or include code snippets, since they go stale quickly. Exception: a prototype's snippet that encodes a decision more precisely than prose can, such as a state machine or a type shape.

<spec-template>

## Problem Statement

The problem the User faces, from their perspective.

## Solution

The solution, from their perspective.

## User Stories

A long numbered list, each "As an <actor>, I want <feature>, so that <benefit>", covering every aspect of the feature.

## Implementation Decisions

The modules to build or change, their interfaces, technical clarifications, architecture, schema changes, API contracts and specific interactions.

## Testing Decisions

What makes a good test (external behaviour, not implementation), which modules are tested, and prior art for the tests.

## Out of Scope

What this spec does not cover.

## Further Notes

Anything else.

</spec-template>

## 6. Draft the breakdown and get it approved

Split the spec into tracer-bullet Tickets.

- Each Ticket cuts a narrow but complete path through every layer (schema, API, UI, tests), not a slice of one layer. A finished Ticket is demoable or verifiable on its own, and fits one fresh context window. Prefactoring goes first.
- A wide mechanical refactor whose blast radius spans the codebase is the exception: expand first (the new form beside the old), then migrate callers in batches, each its own Ticket blocked by the expand, then contract (delete the old form) in a Ticket blocked by every batch.
- Where two or more Tickets change the same file, hand any structural edit to it (wrapping in a provider, splitting a component, extracting a hook) to a Ticket that blocks all of them, and name it in that Ticket's acceptance criteria.
- Give each Ticket its Blockers: only the Tickets that genuinely gate it. One with none can start at once.
- A spec of one Ticket's worth is an Epic with one child.

When the spec removes or moves a UI surface (a page, panel, card, menu or drawer section), check that its actions survive before you show the breakdown. A surface removed without this check once left its actions with nowhere in the app and no Ticket to bring them back:

- **List the actions.** Read the surface's code and list every action the surface offered: buttons, menu items, links, shortcuts, drag targets.
- **Give each a home.** Name where each goes: another surface that already has it, a Ticket in the breakdown that adds it, or an explicit drop in Out of Scope. Put the list in Implementation Decisions, and give the Ticket that removes the surface a criterion that each action has its home. Ask the User about an action with no home.
- **Find what targets it.** Search with `find_tickets` for open Tickets that change the surface, and list them with the breakdown: step 7 flags them for re-triage.

Show the User the spec and the breakdown as a numbered list. For each Ticket give its title, what it delivers end to end, its Blockers and its acceptance criteria (one line each, checkable). A Ticket that changes a rule or guidance gets a criterion that every place stating the rule says the same afterwards.

Ask whether the granularity is right, whether each Blocker really gates its Ticket, and whether any Tickets should merge or split. Iterate until the User clearly approves, in words in this Conversation, both the spec and the breakdown. Silence, or approval of only part, is not approval: ask again.

## 7. Check what changed, then publish

Right before you publish, list the Project's open Epics changed since the time you noted: `find_tickets` with `type: "Epic"`, `status: ["Todo", "In progress"]` and `changedSince` set to that time (plus the Cycle, when the work is planned into one). Read each result with `get_ticket`, except the Epic you are specing. If one removes, renames or rebuilds something the spec relies on, stop and tell the User before publishing, and let them decide.

Then publish, with only the approved breakdown:

- **An idea Ticket.** Call `file_tickets` once with the spec as an Epic (`type: "Epic"`, the spec as its description, label `ready-for-agent`, `originNumber` the idea's number) and its children (each with `epicPosition`, `ready-for-agent`, the acceptance criteria in `acceptanceCriteria` and Blockers in `blockedByPositions`; leave both out of the description). Then, on the idea Ticket: `add_note` "Refined into Epic T<number>", `update_ticket` to remove its triage state label (`needs-triage`, `needs-info`) and `archived: true`. Keep it out of the Epic.
- **A childless Epic.** Call `update_ticket` to replace its description with the spec and add `ready-for-agent`, removing any other triage state label in the same call. It keeps its number, labels and Origin. Then `file_tickets` the children with `epicNumber` set to it, as above. Archive nothing.

Then flag each open Ticket step 6 found that targets a removed or moved surface for re-triage: it is built for something that will be gone. `add_note` on it naming the new Epic and what changes, and with `update_ticket` swap its triage state label for `needs-triage`.

Report the Epic's number and the children's numbers, with their Blockers, and the Tickets you flagged for re-triage, and say that the Epic is ready for an implementation run. Do not start any work on them yourself.

If the User asks you to publish before approving a breakdown, or to leave out the `ready-for-agent` label, follow what they say about the label, but never apply the label without approval.
