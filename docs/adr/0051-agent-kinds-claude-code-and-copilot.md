# Each Conversation runs on an Agent kind: Claude Code or Copilot

Supersedes [ADR 0019](0019-tandembike-starts-agent-runs.md)'s consequence "Only Claude Code runs are started, behind an agent runner seam; GitHub Copilot still connects as before." Changes how [ADR 0029](0029-agent-run-mode-is-a-project-setting.md) (run mode and run model), [ADR 0032](0032-tandembike-ships-a-default-playbook.md) (Playbook), [ADR 0046](0046-a-spar-runs-read-only.md) (Spar runs read-only) and [ADR 0050](0050-the-footprint-is-an-estimate-from-tokens.md) (Footprint) apply. Decided on 2026-11-10 with the User for the Agent-neutral runs Epic T1358 and the Copilot runner Epic T596. Corrected on 2026-11-11 by the spike T597, which ran `@github/copilot-sdk@1.0.31` against this repository (its findings are a comment on T596).

Tandembike could start only Claude Code, and Claude Code ran through every part of a run: the first message was a Claude slash command, read-only runs listed Claude tool names, widgets were served on the Claude SDK, `auto` was Claude's classifier, the brief named Claude-only tools and costs were dollars. Many Users have GitHub Copilot instead. A Copilot User could connect Copilot to the MCP server by hand, but got none of the factory: no starts from the Board, no Allow/Deny or widgets, no Playbook, no worktrees, no Autopilot and no cost.

So every run is now described in Tandembike's own terms, and a runner per **Agent kind** turns it into its agent's terms. The kinds are a fixed list in code, Claude Code and Copilot. Adding Copilot means adding a runner, not changing the Conversations module's rules.

## The Agent kind

- **On each Conversation.** Each Conversation stores its Agent kind when it starts. Replies, resume after a restart, Stop and close always use that kind. A Conversation is never handed to another agent mid-way. Existing Conversations are Claude Code.
- **A Project default.** Each Project has a default Agent kind, Claude Code for existing and new Projects. Only the User sets it, on the Project settings, through a Server Action. No MCP tool reads or writes it, as with the run mode (ADR 0029).
- **Who picks.** Manual starts (Start, Triage, Ask, New Ticket, New Epic, Spar, Plan) offer an agent picker that defaults to the Project's default, once more than one kind can run. Autopilot always uses the default, so unattended work never switches agent by itself. Merge started by Approve merge uses the default too.
- **Changing the default is never refused.** Changing it turns nothing read-only and leaves live Conversations on their own kind. Only new Conversations take the new default.
- **Availability.** Each runner says whether it can run now, with a reason. Claude Code always can. Copilot can when its runtime loads and `getAuthStatus()` says the User is signed in. A kind that cannot run is shown disabled with its reason in the picker and the default selector. A start on it is refused with that reason, rather than dying mid-run.

## One runner seam

- **A run gets a Stage and a Ticket, not a slash command.** `RunOptions` carries the Stage with its Ticket (and the Retro, Plan and Spar extras), a tool policy, the model for the run's kind, the brief and the resolved run mode. Each runner invokes the Playbook skill its own way. T597 found that Copilot loads the same Playbook folder as a plugin (`pluginDirectories`), with the same namespaced commands. So the Copilot runner also sends `/tandembike:<stage> T42` as the first message. The seam still keeps the slash command out of the Conversations module, so a later kind may invoke skills differently.
- **Agent command overrides apply to Claude Code runs only.** An override names a skill in the repository's Claude Code setup, which another agent may not load. A Copilot run always runs the Playbook's skill for its Stage. The settings say the commands apply to Claude Code.
- **Widgets are defined once**, with their name, description, input schema and handler, and import nothing from an agent SDK. Each runner serves them through its own adapter: the Claude SDK's in-process MCP server, or the Copilot SDK's in-process custom tools (`defineTool` with `skipPermission`). They still block the run until the User answers (ADR 0045).
- **Tool restrictions are an agent-neutral tool policy**: `read-only` (Spar, ADR 0046) or `no-ticket-writes` (Autopilot Triage), or none. Each runner translates it. Claude Code gets today's two disallowed lists. Copilot gets `availableTools` and `excludedTools`. T597 found that Copilot's permission handler cannot enforce read-only, because read-only shell commands and read-only MCP tools never reach it. So the policy on Copilot is enforced by the tool filters alone. `excludedTools` wins over `availableTools`, and `custom:*` keeps the widgets available. A test keeps the Copilot list in step with the HTTP server's writing tools, as ADR 0046's test does for Claude.
- **Copilot's own GitHub MCP server is off.** Copilot adds a GitHub MCP server by default. A Tandembike run reaches the tracker only through Tandembike's MCP server, over HTTP with the `X-Tandembike-Cwd` and `X-Tandembike-Run` headers (ADR 0019, ADR 0037). So the runner disables the GitHub server, as Claude Code runs have none.
- **Events stay Tandembike's own.** Each runner maps its agent's events to `RunEvent`s: text, tool calls with the status line's verbs, filed Tickets, cost and tokens, waiting, and exit. The runner also reports whether an end is transient, so ADR 0034's resume-once holds for any kind.

## Run modes and permissions

- **Each runner declares its run modes and whether it can honour Allow-always.** A run whose agent does not support the Project's run mode runs in `default`, and the Conversation shows a note saying so. A Spar is always `default` (ADR 0046). Allow-always is offered only where the runner can honour it. On Claude Code it saves a rule to the repository's local settings, as today (ADR 0021). On Copilot it answers the request with Copilot's approve-for-session, which lasts for that session only.
- **`auto` on Copilot is Tandembike's runner acting on Copilot's Assisted permissions.** T597 found that Assisted mode does not approve anything by itself through the SDK. Every request that needs approval still reaches `onPermissionRequest`, with only an advisory verdict from Copilot's judge. So, with `permissionMode: "assisted"`, the Copilot runner approves a request when the verdict recommends approve, and relays every other request to the User as Allow or Deny. That is what `auto` means on Claude Code: approve what the classifier allows and ask about the rest (ADR 0029). The judge adds a few seconds per request. When `getCapabilities()` reports no assisted approval for the account, the Copilot runner declares `default` only, and the fallback note applies.
- **Copilot's autopilot and approve-all are never used.** Copilot's autopilot is a continuation loop that keeps a session going without the User. It is not Tandembike's Autopilot. T597's Start run finished without it, and it would bypass the relay, so the runner turns continuation off explicitly. `allow-all` is never used, as `bypassPermissions` never is.
- **Git guardrails stay the repository's.** A Claude Code hook in `.claude/settings.json`, such as this repository's git guardrail, does not run on Copilot. Tandembike's Copilot runner adds no guardrail of its own, as ADR 0019 leaves conventions to the repository. A repository that wants one on Copilot adds a Copilot hook. Copilot's Setup check reports whether one exists, as advice only (ADR 0020).
- **No Copilot co-author trailer.** Copilot adds `Co-authored-by: Copilot` to commits by default. The runner turns it off, so a commit carries only the attribution the repository's instructions ask for.

## Models

The run model and triage model are set per Agent kind. Blank means that agent's own default. The existing values become the Claude Code ones. A run uses the model for its Conversation's kind, so a Claude model name is never sent to Copilot. Unset, T597's Copilot sessions ran on the account's default, a Claude Sonnet model. The fields for a kind show only once that kind can run.

## Cost in each kind's own unit

- **Dollars for Claude Code, GitHub AI credits for Copilot.** Every stored and shown cost carries its unit. Copilot's credits are its reported nano-AIU divided by 10⁹, recorded live from each `assistant.usage` event, because those events are not kept in the session's own log. T597 could not confirm live how a session's credits map to what GitHub shows the User. The figure is Copilot's own report, labelled as AI credits.
- **No conversion and no cross-kind total.** Nothing adds or converts dollars and credits, so no figure is made up. Totals are per unit.
- **Ceilings and estimates are per unit and per kind.** The Spend, Triage and Machine ceilings are kept per unit, and the existing ones count dollars. Autopilot checks the ceiling in the unit of the agent it would start. Start and Plan estimates come only from Conversations of the same kind.
- **No in-run credit cap.** Copilot can cap a session with `sessionLimits.maxAiCredits`, but its minimum is 30 credits, above what T597's whole Start run used. Claude runs have no in-run cap either. Ceilings are checked before Autopilot starts a run, and a run may overshoot, as today.

## Footprint

Copilot reports tokens per model, so Copilot runs feed the same per-model usage as Claude runs (ADR 0050). A Claude model served by Copilot maps to the Haiku, Sonnet and Opus tiers by name. On a Copilot run, any other model's tokens are stored, but they are **not measured**: never counted as Opus, and left out of the Footprint and its totals. ADR 0050's "any other model counts as Opus" still holds for Claude Code runs, whose models are all Claude's. A non-Claude model has no tier to borrow, and the Footprint must not pretend to know. Factors for those models are T1370.

## Run brief and Setup

The brief is written per kind. The shared parts are the same for every kind: Project, Ticket, intent, the UI note, the widget tools, the Agent-run ID, the Tandembike worktree, the Check command, Retro and Plan. The Claude-only lines (EnterWorktree, "AskUserQuestion also works", the `CLAUDE.md` Setup check) go to Claude Code runs only, and a Claude Code brief stays word for word as before. A Copilot run works in Tandembike's run worktree, like any run (ADR 0033). Only in the fallback, with Parallel runs on and no Tandembike worktree, is it told to use the repository's worktree convention or `git worktree add`, since Copilot has no built-in worktree tool. Its Setup check accepts `AGENTS.md` or `.github/copilot-instructions.md`, which Copilot loads, instead of requiring `CLAUDE.md`.

## Auth

A Copilot run uses the User's own Copilot sign-in and `~/.copilot`, where Copilot keeps its sessions. Tandembike stores no token. The Copilot SDK is a dependency loaded only when a Copilot run starts, so a Claude-only setup pays nothing for it.

## Out of scope

- The Copilot coding agent on GitHub, which works in the cloud from issue to PR.
- Copilot Terminal Conversations: `tandembike implement` (then `tandembike start`, ADR 0052) stays Claude Code only for now (ADR 0039, T1369).
- Agent command overrides for Copilot, and a third Agent kind or a plugin registry for runners.

## Considered Options

- **A Project-wide agent, with read-only Conversations after a switch.** One setting decides everything, but a switch would strand live Conversations, and Claims would have to be released on a switch. Rejected for an Agent kind per Conversation, with a Project default that changing never refuses.
- **Copilot's own autopilot for unattended runs.** It would add a second "autopilot" that bypasses the relay. T597's run finished without it.
- **Trust Assisted mode to approve by itself.** It does not, through the SDK. Treating `auto` as Copilot's `default` would make every Copilot run in an `auto` Project idle on each request, so the runner acts on the verdict instead.
- **Enforce Spar's read-only through the permission handler.** Read-only shell commands and MCP tools never reach it, so it cannot see everything a Spar does. Tool filters can.
- **Inline each `SKILL.md` into the first message.** Not needed: Copilot loads the Playbook as a plugin.
- **The Copilot runner denies destructive git commands by text.** It would impose one repository's conventions on all of them, which ADR 0019 rules out.
- **Pass the remaining ceiling as `maxAiCredits`.** Its minimum of 30 is above a typical Start run, so it would rarely act before the ceiling check, and Claude runs have no such cap.
- **Convert AI credits to dollars for one total.** Rates differ by plan and change, and the mapping to GitHub's billing is unconfirmed, so the total would be made up.

## Consequences

- The Conversations module picks a runner by the Conversation's Agent kind on start, reply, resume, stop and close. App wiring registers the runners.
- A new writing tool on the HTTP server must be excluded for both runners' read-only policies; the tests fail until it is.
- A Copilot run in this repository has no git guardrail until the repository adds a Copilot hook.

  _Note (2026-11-11, T1396):_ it has one now. `.github/hooks/git-guardrail.json` runs the same guardrail (`src/git-guardrail/`) as a Copilot `preToolUse` command hook, with the same rules and reasons as the Claude Code hook. It is the repository's own hook, which Copilot loads from `.github/hooks/`; the Copilot runner still adds none.
- AI-credit figures follow Copilot's own report, which may not match GitHub's billing page exactly.
- A Copilot run on a model that is not Claude's leaves those tokens out of the Footprint until T1370 adds factors.
