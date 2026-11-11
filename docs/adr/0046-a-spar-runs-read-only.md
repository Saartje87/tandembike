# A Spar runs read-only

Amended by [ADR 0051](0051-agent-kinds-claude-code-and-copilot.md): the read-only rule is an agent-neutral tool policy that each runner translates. Claude Code gets the disallowed lists below. Copilot gets `availableTools` and `excludedTools`, since its permission handler never sees read-only calls.

Builds on [ADR 0019](0019-tandembike-starts-agent-runs.md), [ADR 0029](0029-agent-run-mode-is-a-project-setting.md) and [ADR 0045](0045-widgets-are-typed-tools-that-block-the-run.md).

A **Spar** is a Conversation in which the User thinks an idea through with an Agent, on a page of its own with a shared Canvas and Write-up. Brainstorming should never change the repository or the tracker behind the User's back: the only way a Spar files work is the User's approved Hand-off, a Server Action.

- **Permission mode `default`, always.** A Spar run ignores the Project's Agent run mode (ADR 0029): even in a Project that runs `auto`, every call that is not pre-allowed reaches the User as a permission request. Bash included.
- **Writes are disallowed, not just asked.** A Spar run is passed `disallowedTools` for file edits (Edit, Write, NotebookEdit) and every Tandembike tool that creates or changes Tickets or Cycles: everything on the HTTP server without `readOnlyHint`. A test keeps that list in step with the tool list. Read, Grep, Glob, the read-only Tandembike tools, the Widget tools and the Spar tools stay.
- **Main checkout, no slot.** A Spar runs in the main checkout with no worktree, as it writes nothing. Like an Ask it is the User's own interactive Conversation: it holds no Start run or Machine slot, and a reply is never refused (ADR 0031, ADR 0041).
- **Only the User starts one.** The Conversations module refuses a Spar started by anyone but the User, so neither Autopilot nor a Terminal session starts one; `tandembike start` has no Spar intent.
- **Its own page.** A Spar's id is its Conversation's, so a Notice or a Board bell can open the Spar page from the Conversation alone. The Conversation dialog shows no tab for it.

## Considered Options

- Trust the Spar skill to stay read-only: a skill is guidance, and an `auto` Project would run writes without asking.
- A worktree per Spar: it costs a checkout and a Prepare command for a run that writes nothing.
- Count a Spar against the Machine cap: it would refuse the User's own thinking while Autopilot works, which no other interactive Conversation does.

## Consequences

- A new write tool on the HTTP server fails the Spar test until it is added to `sparDisallowedTools` or marked read-only.
- A Spar that needs a command, such as running the tests to check an idea, asks the User each time.
