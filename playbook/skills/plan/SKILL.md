---
name: plan
description: "Plan a Tandembike Cycle toward a goal: pick triaged Backlog work, order it so Blockers come first, and propose a Prepared Cycle with create_cycle for the User to review. Never starts a Cycle."
disable-model-invocation: true
---

The first message gives a goal in the User's words, such as `Ship the beta`. You propose a Prepared Cycle that gets the Project there. You propose, the User decides: you never start a Cycle, and you never change a Ticket. You work with the User here: they answer in this Conversation, so ask, wait, and carry on from what they say.

## 1. Read the goal and the work there is

Call `get_project` for the Project's Cycles and labels. Call `find_tickets` for the Backlog's work that is ready for an agent: the label `ready-for-agent`, Todo, in no Cycle and not Blocked. Call `get_ticket` on each candidate that looks relevant to the goal, for its description, acceptance criteria, Blockers and Epic. An Epic stands for its children: plan the children, not the Epic. Leave out anything archived, Done, already planned in a Prepared or Active Cycle, or labelled `needs-triage`, `needs-info` or `wontfix`.

## 2. Ask when the goal and the work do not meet

Stop and ask the User, offering the choices with the `ask_choice` Widget tool (AskUserQuestion where it is missing, such as in a terminal) or a short question, when:

- the goal is ambiguous, and two readings would pick different Tickets;
- the ready work does not cover the goal: say what is missing and ask whether to plan what exists, or to wait until it is triaged or specced;
- the goal is bigger than the work there is, or the User names a budget the work does not fit.

Do not guess. Carry on only when you and the User agree what the Cycle is for.

## 3. Choose and order

Choose the Tickets that serve the goal. Order them so that Blockers come first: a Ticket never comes before one that blocks it. A Ticket blocked by something outside the Cycle that is not Done waits on it, so leave it out or say so. Prefer a small Cycle the Project can finish to a long one.

The brief gives the Project's estimated cost per Ticket, or says there are not enough runs to estimate. When the User names a budget, divide it by that figure to find how many Tickets fit. Without an estimate, size the Cycle by the work and say you could not price it.

## 4. Propose the Cycle

Show the User the Cycle you would propose: its title, the Tickets in order with a line each on why, and what you left out. Wait for their answer, then adjust.

Call `create_cycle` with a title taken from the goal and the Tickets' numbers in the order you chose. It makes a Prepared Cycle and never starts it. If it refuses, fix what it names and call it again. When the User wants the title changed afterwards, rename the Prepared Cycle with `update_cycle`; once it is Active or Archived, only the User renames it.

## 5. Finish

End your final message with the Cycle's id and title, the Tickets in order, and the estimate: the per-Ticket figure times the number of Tickets, or that there are not enough runs to estimate. Tell the User the Cycle is Prepared and that starting it is theirs.
