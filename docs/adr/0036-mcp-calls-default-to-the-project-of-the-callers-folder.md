# MCP calls default to the Project of the caller's folder

Decided on 2026-11-08 (T1192, phase 6 of [`software-factory-2.md`](../roadmap/software-factory-2.md)). Amends [ADR 0014](0014-server-explains-tracker.md) for the instructions and [ADR 0020](0020-setup-advises-the-user-decides.md) for the checklist.

ADR 0014 had each repository name its Project in `AGENTS.md`, and Setup checked for that line and for a per-repository MCP config. A terminal session in a repository without the line filed Tickets in the wrong Project, or asked.

Every MCP request may carry the caller's working directory in an `X-Tandembike-Cwd` header. A spike (`docs/research/mcp-caller-folder.md`) showed that a user-scope Claude Code registration with `--header 'X-Tandembike-Cwd: ${PWD}'` sends the session's folder, and that the Agent SDK sends custom headers but expands `${VAR}` against its own process, not the run's folder. So Tandembike's runs send the literal path, and no `repositoryPath` argument is needed.

- **Resolution order.** The Tickets module's `ProjectRef` gains `cwd`. `resolveProjectId` uses `projectId`, then `projectName`, then `cwd`; an explicit name or id always wins.
- **Folder to repository.** Walk up to the nearest `.git`. A worktree's `gitdir:` file is followed to the repository through its `commondir`, so a worktree outside the repository counts. Only files are read.
- **Longest match.** The Project whose repository path is the longest prefix of that repository wins, so a nested repository belongs to its own Project. Repository paths are unique (compared after resolving symlinks); duplicates that predate the rule are not migrated, and a folder in two Projects' repositories is refused naming both.
- **Refusals.** An unknown folder is refused naming the folder and the Projects. An archived Project's folder resolves, and its writes get the usual read-only refusal.
- **`list_tickets`** without a Project lists the folder's Project when one contains the folder, and every Project otherwise; `allProjects: true` lists every Project.
- **Instructions and Setup.** The server instructions say that Project tools default from the working folder, within `maxInstructionsLength`. Setup's checklist drops the Project-name line and the per-repository MCP config.

## Considered Options

- A `repositoryPath` argument on every Project tool: the Agent would have to know and pass its folder on each call; the header needs nothing from it.
- Keep naming the Project in the repository: it is the setup this removes, and it breaks in a repository that lacks the line.

## Consequences

- A session in a folder no Project contains must pass `projectName`, as before.
- Tandembike's own runs start in the Project's repository path, so they resolve to their Project; a run in a worktree of it does too.
