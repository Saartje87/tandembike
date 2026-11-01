# Runs pre-allow Tandembike's tools and can save allow rules

ADR 0019 relays every permission prompt a run would show in a terminal to the User as Allow or Deny in the Conversation. In practice the User allowed all of the first 40 requests and denied none, and a quarter of them were Tandembike's own MCP tools. Each prompt idles the run until the User returns. This ADR refines ADR 0019 to cut the prompts the User always answers the same way, without giving up the relay.

Runs stay pinned to the `default` permission mode, so neither a repository's `defaultMode` nor `bypassPermissions` can skip the relay. The runner pre-allows exactly one thing, the `mcp__tandembike` server it injects itself, so a run never asks before reading or updating Tickets, in any repository or worktree. It pre-allows nothing else: what other tools a repository trusts is that repository's own allowlist (ADR 0014).

When a run proposes a rule for a request, the User can choose "Always allow" in the Conversation. That allows the call and saves the rule to the repository's local, gitignored Claude Code settings, never the committed file. Later runs in that repository, and its worktrees, stop asking for it. The User sees the exact rule on the button before choosing it.

## Considered Options

- `bypassPermissions` for runs: no prompts at all, but full shell access for anything that starts a run. ADR 0019 already rejected it, and the User's repositories are not all trusted equally.
- Honour the User's `auto` mode: its classifier makes what prompts unpredictable, and whether its escalations reach the relay is unverified.
- Save always-allowed rules to project settings: a run's branch would change the committed allowlist without anyone seeing it.
- Pre-allow more than the injected server, such as read-only Bash: Tandembike does not know which commands a repository considers safe.

## Consequences

- Only the Claude runner knows SDK permission types; the runner seam carries rule strings in Claude Code's own syntax.
- The User cannot view or revoke saved rules from Tandembike; they edit the local settings file.
- Rules are saved per repository, so each repository's allowlist grows independently.
