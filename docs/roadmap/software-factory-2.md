# Roadmap 2: a software factory for any local repository

Status: agreed on 2026-11-08 in a grilling session (T1191). It continues [`software-factory.md`](software-factory.md), whose phases 0 to 4 are built. Its phase 5, the independent Review stage (T1093), was rejected on 2026-11-08: see [`.out-of-scope/independent-review-runs.md`](../../.out-of-scope/independent-review-runs.md). Each phase below has a placeholder Epic, specced with `/to-spec` and `/to-tickets` when its turn comes, by "Publishing a spec" in `docs/agents/issue-tracker.md`. Decisions here can be revisited. When one changes, update this file in the same PR.

## Goal

Point Tandembike at any repository on the machine and the factory works there, with no per-repository setup. Tandembike brings a default way of working, the **Playbook**, and owns the parts every run otherwise gets wrong, such as worktrees. The same flow runs from the UI, from Autopilot and from a CLI agent session in a terminal. The User gates three things: approving triage, starting a Cycle and approving a merge. Everything else runs by itself, within the spend ceilings.

## Vocabulary

Existing terms keep their meaning. New terms this roadmap introduces, added to `GLOSSARY.md` by the phase that builds them:

- **Stage**: a step of the flow with its own Conversation intent and Playbook skill: Triage, Spec, Start (build, with its inline review), Merge, Plan, Retro.
- **Playbook**: the skills Tandembike ships and loads into every run, one per Stage. A Project's Agent command, when set, overrides the Playbook for its Stage.
- **Run outcome**: what a Conversation's run ended in, recorded when it ends: its Stage, its result, cost, duration, model, and whether the Playbook or an override ran.
- **Merge gate**: the point where a reviewed PR with green checks waits for the User's Approve merge.
- **Terminal**: a third value of **Started by**, for a Conversation the `tandembike` CLI started as an interactive session in a terminal.
- **Check command**: a Project's command that defines "green" for its runs, detected when the Project is added.

## Decisions

The questions (Q1 to Q30) are the session's. Each decision gives its reason.

### Audience and install (Q1, Q23)

Others can install Tandembike, so it is built like a product, but it stays local: nothing is published to npm. It runs from its git checkout. `npm run setup` builds it and links a global `tandembike` command with `npm link`, and `tandembike` starts the server on port 4747. Data moves from the repository's `data/` to `~/.tandembike/`, so one install serves every repository. On first run Tandembike offers to register its MCP server, and the Playbook plugin (phase 10), at user scope in Claude Code. The User confirms each, in the spirit of ADR 0020. The checkout carries a marketplace manifest named `tandembike` whose one plugin is `./playbook`, so the plugin offer (`claude plugin marketplace add`, then `claude plugin install tandembike@tandembike --scope user`) needs no network; it is repeated when the installed version is older than the bundled one, and `tandembike plugin` makes it again. An optional login item starts it at boot.

### Runner scope (Q5)

Claude Agent SDK only for now. Copilot (T596) stays as phase 13. Everything below must leave room for it: the Playbook uses the SKILL.md format, the agent runner seam carries the worktree, plugins and the Run outcome, and no phase assumes Claude-only features where a neutral one fits.

### Tandembike ships a default Playbook (Q2, Q8, Q9, Q24)

This reverses part of ADR 0019, which leaves the whole process to the repository. A repository with no skills of its own still gets the full flow. The Playbook is a Claude Code plugin bundled in Tandembike and loaded for every run through the SDK's plugins option, so nothing is written into the User's repository and upgrades come with Tandembike. Its skills are adapted from `mattpocock-skills` (MIT, copyright notice kept) to use the phase 8 tools directly. A Project's Agent command still overrides a Stage: blank means the Playbook, a set command means the repository's own skill. This repository keeps its overrides. Rejected: copying skills into each repository (they drift, and Setup would edit every repository), prompts in code without skills (not reusable from a terminal), and depending on the external plugin (T1140, archived).

### The flow is a pipeline of Stages (Q10)

Intake → Triage → (Spec, for work too big for one Ticket, splitting into an Epic) → Queued → Start (build, check, inline review, open PR) → Merge gate → Done. Status stays Todo, In progress and Done, and Lanes stay derived (ADR 0023). A Stage is a Conversation intent with its own Playbook skill. Spec and Merge are new intents. There is no separate Review run: the Start run reviews its own PR with the Playbook's review skill, and the User at the Merge gate is the second pair of eyes. An independent Review run per PR (T1093) was measured and rejected, with 0 real misses in 5 PRs.

### Human gates (Q4)

The User approves triage, the only path to `ready-for-agent`, starts each Cycle and approves each merge. Runs default to `auto` Agent run mode in this flow. Every other step runs without the User.

### The Merge gate (Q11)

A Ticket whose PR is reviewed and green waits in Needs you with **Approve merge**. The click resumes its Start Conversation, or starts a Merge run, which merges, completes the Ticket and leaves cleanup to Tandembike. The merge stays on the Agent's side (ADR 0038), so it works for any git host and handles rebases and conflicts. Tandembike itself still runs no `gh`. Rejected: Tandembike calling `gh pr merge` (one host only, no conflict handling), and detecting merges made on GitHub (polling, a network dependency).

### Tandembike creates run worktrees (Q3, Q7)

This reverses ADR 0019's "Tandembike never runs git and does not track worktrees". Leaving worktrees to each run cost tokens in every run and failed in practice (T1145, T1146, T1161, T1162), and a run started in the main checkout shares it until it follows the instruction. With Parallel runs on, Tandembike creates a worktree for each Start and Merge run before the run starts and sets the run's cwd to it. It then runs the Project's prepare command, if any (such as `npm ci`), and removes the worktree when the Conversation closes or the PR merges. The Agent still branches, commits, pushes and opens the PR. Triage, Spec, Plan, Setup and Retro run in the main checkout and change no code. See ADR 0033.

### Onboarding a repository (Q14, Q16)

New Project means picking a folder. Tandembike detects git, the default branch, the remote and a Check command (from `package.json` scripts, a `Makefile` and the like), and the User confirms. The Check command is handed to Start and Merge runs as the definition of green before a PR. Setup stays, but only to suggest extras such as a `CLAUDE.md`. It is no longer needed to start (amends ADR 0020). MCP calls default to the Project whose repository path contains the caller's cwd, worktrees included. An explicit `projectName` still wins, and an unknown path is refused with the known Projects named. A repository's `CLAUDE.md` no longer has to name its Project.

### Workflow MCP tools (Q6, Q15)

Today's ~50 fine-grained tools and long server instructions cost context in every run and are near the instructions limit (T645). They are replaced in one go, with no compatibility layer, by about 14 workflow tools:

| Tool              | Does                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `next_work`       | The next Eligible item for this Project                                                                                               |
| `start_work`      | Claim and In progress; returns the Ticket, criteria, comments, Blockers, Epic context, the Check command and the Stage's instructions |
| `add_note`        | A Comment                                                                                                                             |
| `check_criterion` | Check an acceptance criterion                                                                                                         |
| `open_pr`         | Add the PR reference; the Ticket moves to Review                                                                                      |
| `finish_work`     | The completion rule and Claim release                                                                                                 |
| `abandon_work`    | Release with a reason, back to Todo or Stalled                                                                                        |
| `file_tickets`    | Create Tickets with Epic, Blockers, Origin and labels in one call; also feedback and splits                                           |
| `propose_triage`  | A triage proposal for the User to approve                                                                                             |
| `propose_cycle`   | A proposed Prepared Cycle for a goal                                                                                                  |
| `find_tickets`    | Search and filters                                                                                                                    |
| `get_ticket`      | The whole Ticket                                                                                                                      |
| `update_ticket`   | Edit fields                                                                                                                           |
| `attach`          | Add an Attachment                                                                                                                     |

The rest, such as `sort_lane`, Cycle renames and restores, becomes UI-only through Server Actions. Each Playbook skill names the three to five tools its Stage uses.

### Triage and planning run by themselves (Q12, Q13, Q20)

Autopilot also dispatches Triage runs for Intake, Backlog included, on a Project's triage model, under a per-day triage spend ceiling, since the existing Spend ceiling is per Cycle. A Triage run proposes labels, criteria, splits and duplicates through `propose_triage`. Only the User's approval applies `ready-for-agent`. A **Plan** Conversation takes a goal, picks triaged Backlog work, orders it by Blockers, estimates its cost from Run outcomes and proposes a Prepared Cycle. The User reviews it and starts it, and planning by hand stays. Agent-filed feedback is capped at three Tickets per run and deduplicated in `file_tickets`. The Retro clusters a Cycle's `from:agent-run` Tickets into a few proposals and archives the rest as seen.

### Failures, outcomes and control (Q18, Q19, Q21, Q22)

- **Transient resume**: a run that ends on an API overload, rate limit or network error is resumed once after a backoff, as Started by Autopilot. A substantive end, such as failing tests, a question or a refusal, still waits for the User. This amends ADR 0030's "no retries". See ADR 0034.
- **Run outcomes**: every Conversation records its Run outcome when it ends. Stats show success rate and cost per Stage (T80), and Plan uses them for estimates.
- **Machine-wide cap**: at most three concurrent runs across all Projects by default, and an optional global daily spend ceiling, on top of each Project's limits. Autopilot fills free global slots across Projects in round-robin order.
- **Notifications**: when Needs you grows while the User is not looking, Tandembike sends a notification for a question, a merge or triage to approve, a stalled run or a hit ceiling. It uses browser notifications from the open tab first (T355).

### CLI sessions (Q27 to Q30)

- The Playbook plugin registers at user scope, so `/tandembike:implement T42` and the other Stages work in any repository's terminal session. A repository's overrides still apply.
- `tandembike start T42` (and `triage`, `plan "<goal>"`, `next`) resolves the Project from the cwd and creates the worktree as for a UI run. It records a Conversation Started by Terminal and execs interactive `claude` there, with the Stage's command, brief and Agent-run ID. This is the main way to work from a terminal. A bare `claude` session that only calls MCP still works, as an untracked Agent.
- On the Board a Terminal Conversation is In flight, with a Status line from its latest MCP call, since Tandembike has no transcript of an interactive session. It has no permission relay, because the User answers prompts in the terminal. It counts against no run cap or spend, and its Ticket is not Eligible while it is open. It ends when the CLI reports that `claude` exited, or after an idle timeout. A session that exits before `finish_work` leaves its Ticket Stalled, as today.
- **Continue in terminal** on a UI Conversation copies `tandembike resume <conversation>`. That command stops the UI run and runs `claude --resume <session id>` in its worktree, and the Conversation becomes Terminal. The reverse waits.

## Phases

Each phase is one Epic, blocked by the one before. Phase 6 comes first.

### Phase 6: repo integration and local install (T1192)

New Project from a folder with detection and a Check command. Project from cwd in MCP. `npm run setup`, the `tandembike` command, `~/.tandembike/` and the MCP registration offer. ADR: the install and data location. Glossary: Check command.

### Phase 7: run worktrees, Run outcomes, transient resume (T1193)

Worktrees made by Tandembike, with a prepare command and cleanup. A Run outcome on every Conversation, with Stats per Stage. One transient resume. ADRs 0033 and 0034, written with this roadmap. Glossary: Run outcome. Should close T1145, T1146 and T1161, and give T1162 one place to solve migration numbering.

### Phase 8: workflow MCP tools (T1194)

The tool set above, replacing the old one, and shorter server instructions (T645). ADR: the workflow tool surface, amending ADR 0014.

### Phase 9: default Playbook, Spec and Merge Stages, Merge gate (T1195)

The bundled plugin, Agent commands as overrides, the Spec and Merge intents and Approve merge. ADR 0032, written with this roadmap. Glossary: Stage, Playbook, Merge gate.

Built in steps. T1218: the plugin folder `playbook/` with its lock file, the runner's `plugins` option, one per-Stage command list that drives the first message and the agent commands form, new Projects blank and `auto`, and the `implement` skill. T1219: `review` (model-invocable, run by `implement` before the PR) and `implement-epic`. T1220: `triage` and `retro`. T1221: the Merge gate, with the `merge` intent and command, Approve merge in the drawer, a Merge always in a worktree and counted against the Start run limit, the approved merge outside the Spend ceiling, and ADR 0038. T1222: the Spec Stage, with the `spec` intent and command, the Spec button for an Intake Ticket or an Epic without children, and the `spec` skill. Each step added its Stage to the list and its skill to the plugin, and bumped the plugin's version and lock (`npm run playbook:lock`). T1223 ran the factory end to end on a throwaway repository: [`factory-dry-run.md`](../research/factory-dry-run.md).

### Phase 10: CLI sessions (T1196)

The plugin at user scope, `tandembike start | triage | plan | next | resume`, and Terminal Conversations on the Board. ADR: Terminal Conversations. Glossary: Terminal under Started by.

### Phase 11: autonomous intake and planning (T1197)

Triage dispatch with its ceiling and model, `propose_triage` approval, the Plan Conversation, the feedback cap and Retro clustering. ADR: Autopilot triages, amending ADR 0030.

### Phase 12: machine-wide control and notifications (T1198)

The global cap and ceiling with round-robin dispatch, and notifications. ADR: machine-wide limits.

### Phase 13: Copilot runner (T596)

As already specced, blocked by phase 9 so the Playbook and the runner seam exist first.

## Risks and open questions

- **Plugins through the SDK.** Phase 9 assumes the Agent SDK loads a local plugin per run, and that its skills run as commands in the first message, as today's Agent commands do. Spiked in T1205: it holds, with the Playbook's commands always namespaced and the user-scope copy kept current in phase 10 ([`sdk-plugin-per-run.md`](../research/sdk-plugin-per-run.md)).
- **Worktree cleanup and resume.** Removing a worktree on close loses an uncommitted change the User may want. Phase 7 must decide whether a dirty worktree is kept and flagged instead. `claude --resume` from a terminal (phase 10) also needs the worktree to still exist.
- **Project from cwd with nested repositories.** Two Projects whose paths nest need a rule, such as the longest match wins.
- **Terminal sessions without a transcript.** A Status line from MCP calls alone may be too sparse. Revisit after real use.
- **Auto mode by default.** Phase 9 makes `auto` the norm for Playbook runs. Its classifier is the only check between a run and the shell, so watch Run outcomes for denied or surprising calls.
- **One big MCP cutover.** Phase 8 changes every skill and doc that names a tool at once. Phase 9's Playbook is written against the new tools, but this repository's own skills and `docs/agents/` must move in the same phase.
