# Agent run mode is a Project setting

Amended by [ADR 0032](0032-tandembike-ships-a-default-playbook.md) (T1218): new Projects start in `auto`, so the Playbook's runs do not idle on every unlisted call. Existing Projects keep their mode.

Amended again (T1228): a Project created with a repository folder also starts with agent mode on, and with Parallel runs on when the folder is a git repository with a default branch. Each Start run then gets a worktree of its own (ADR 0033) and never touches the User's checkout, so the first Start works hands-off without a trip to the settings. A Project created without a folder keeps both off, since agent mode needs a path. The User can turn either off in the Project settings, and existing Projects keep what they have.

ADR 0021 pinned every run to the SDK's `default` permission mode, so no repository's `defaultMode` could skip the relay of Allow and Deny to the User. That holds a factory back: each unlisted call idles a run until the User returns. The spike in `docs/research/auto-permission-mode.md` found that the SDK's `auto` mode asks `canUseTool` only for calls its classifier cannot decide, so the relay keeps working there.

Each Project has an **Agent run mode**, `default` or `auto`, and every run the Project starts uses it, by hand or by Autopilot. Every Project was `default` at first, so nothing became more permissive without the User's choice. New Projects now start in `auto`, and existing Projects keep the mode they have; the User can switch either way. The User sets it on the Project settings page, with the trade-off next to `auto`: in the spike the classifier allowed a hard reset, a file written outside the repository, an outbound POST and a push without asking. It is a Project agent setting, set only through a Server Action and kept out of the MCP-visible `Project` (ADR 0019), so no Agent can loosen its own permissions.

The runner still pre-allows exactly the `mcp__tandembike` server it injects (ADR 0021) and still relays through `canUseTool`. `bypassPermissions` and `acceptEdits` are never used. Setup reports the mode and whether a hook in the repository blocks destructive git commands, advisory only (ADR 0020), and never suggests `auto`.

The same setting row holds the **run model**: unset, the User's default model, or a named Claude model that the runner passes as the SDK's `model` option. It is the largest per-run cost lever measured (cut 1 of `docs/research/start-run-cost.md`). A run can still change models itself; the setting only picks the starting model. Existing Projects keep the User's default.

This supersedes the pinned `default` in ADR 0021; the rest of ADR 0021 stands.

## Considered Options

- One global mode: repositories are not equally trusted.
- A factory-only mode: the same repository's runs would behave differently by who started them.
- `bypassPermissions`: full shell access with no relay, rejected by ADR 0019.
- `acceptEdits` plus the allowlist: prompts for every push and PR and adds no safety for Bash.
- Honour the repository's or the User's `defaultMode`: the Project could not tell what its runs do.

## Consequences

- A Project in `auto` can do what the classifier allows without the User seeing it first; the User owns that choice per Project.
- Calls the classifier cannot decide still reach the Conversation as Allow or Deny.
