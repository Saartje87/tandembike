---
name: retro
description: "Look back on a Tandembike Cycle: its Tickets, comments and agent-filed feedback, and propose changes to the process as Tickets once the User agrees."
disable-model-invocation: true
---

Adapted from the `retro` skill of `mattpocock-skills` (MIT, see the plugin's LICENSE).

The first message names a Cycle by its title and id, such as `"Launch the beta" (Cycle 12)`. You run a retrospective on it: you look for improvements to the coding agent's **environment** (its instructions, docs, checks and tools) that make future runs better. You propose, the User decides.

## Steps

1. **Gather what happened.** Call `get_project` for the Cycle and its Tickets. Call `find_tickets` with the Cycle's id for each Ticket's Status, labels and Blockers, and `get_ticket` with `include: ["activity"]` for the ones worth a closer look. Read their comments. Read the Tickets the agents filed as feedback (`find_tickets` with the label `from:agent-run`, and `from:tandembike`) and any with `needs-info`, `wontfix` or a long time in progress. Read the repository's own instructions and check commands to see what already exists.

2. **Look for candidates** in these categories:
   - **Navigation**: did agents take long to find the right files? Would a pointer in the instructions help?
   - **Automated checks**: did an agent make a mistake a linter, type check, test or CI job could catch? Read the repository's own check command and CI first: a check that exists but is unwired or broken is the finding, not a new one. A repository with no guardrail at all is a finding.
   - **Coding standards**: did review miss something? A mechanical violation (a fixed pattern, banned API, import shape) gets a deterministic check; reserve written standards for judgement calls.
   - **Instructions**: are steering files large, contradictory or doing nothing? Move what a check could enforce into a check.
   - **Tool economy**: did agents make expensive or repeated tool calls that could be streamlined?
   - **Information access**: did agents lack something they needed, such as logs or a service?
   - **Tickets**: vague Tickets, missing acceptance criteria, Blockers found too late, work split badly.

3. **Present the candidates** to the User in the Conversation, most severe first. For each: what happened (cite Ticket numbers), the change you propose, and why it would help. Ask which to file.

4. **File Tickets only after the User agrees.** Wait for the User's answer in the Conversation. Then call `file_tickets` for exactly the proposals the User approved, each with a clear problem, the proposed change, acceptance criteria and the Cycle's Tickets it came from. Search with `find_tickets` first so you do not duplicate one. If the User declines everything, file nothing. Never file on your own judgement before the User has answered.

End your final message with the numbers of the Tickets you filed, or that you filed none.
