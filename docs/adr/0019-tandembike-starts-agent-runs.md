# Tandembike starts Agent runs, and leaves their process to the repository

Until now Agents only connected to Tandembike; the User started them in a terminal. To let the User start, triage and talk to an Agent from a Ticket or a Board, the server now launches headless Claude Code runs itself, through the Claude Agent SDK, in the Project's repository path. Each run is a Conversation shown in the UI: the User replies into it, and every permission prompt the run would have shown in a terminal comes to the User as an Allow or Deny in the Conversation. The run reaches the tracker the way every Agent does, as an MCP client of the server (ADR 0002), so Claims, Activity and live updates need no new path.

Tandembike tells a run only its situation: the Conversation's Ticket or Project, its intent, that a human answers in the UI, its Agent-run ID, and, when the Project allows parallel runs, that it must work in a git worktree of its own. How to do the work stays with the repository, as ADR 0014 splits it: the run loads the repository's own instructions, settings and skills, names its branch by the repository's rules, and creates, prepares and removes its worktree by the repository's conventions, or with Claude Code's built-in worktree when the repository has none. Tandembike never runs git and does not track worktrees, because it serves repositories whose conventions it does not know. A run therefore starts in the main checkout and moves into its worktree only by following the instruction; we accept that, since edits outside the User's allowlist still wait for the User.

Starting a process with shell access changes what ADR 0001's missing authentication exposes: any web page the User visits can send requests to `localhost:4747`. Runs therefore start only through Server Actions, whose origin Next checks, never through a route handler or an MCP tool, so neither another site nor an Agent can start one. A Project's repository path is set only by the User, for the same reason. Each run keeps its transcript and SDK session ID in SQLite; when the server restarts, its runs die and are marked interrupted, and the User's next reply resumes them, rather than keeping them alive in a separate daemon that ADR 0002's one-process design rules out.

## Considered Options

- Queue a request that an Agent the User already runs picks up: Tandembike stays passive, but nothing happens unless a session is listening.
- Open a terminal running `claude` in the repository: no new attack surface, but the Conversation happens outside the UI.
- Tandembike creates each worktree with `git worktree add`: it would know every worktree's path and could refuse to remove a dirty one, but only by assuming each repository's git conventions.
- `bypassPermissions` for runs: no prompts to relay, but full shell access for anything that starts a run.

## Consequences

- Only Claude Code runs are started, behind an agent runner seam; GitHub Copilot still connects as before.
- A repository whose instructions live only in `AGENTS.md` needs a `CLAUDE.md` that includes it, since the SDK loads `CLAUDE.md`.
- A Project caps its concurrent Start runs; a Start beyond the cap is refused, not queued.
