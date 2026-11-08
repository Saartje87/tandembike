# Where a Start run's cost goes (T1089)

Question: in a Start run, how much of the cost and time goes to setup (worktree and install), to the work itself, to the final check, to git and the PR, and to tracker calls? The auto-mode spike (`auto-permission-mode.md`) said setup was most of its $1.60. Is that right, and which cuts would save the most per run? This file measures and ranks. It changes nothing.

Date: 2026-11-08. Measured from existing logs only; no new runs were started.

## Answer in short

- **Setup is not most of a trivial run's cost.** In the spike, worktree and install took 11% and the final check 2%: $0.20 of $1.60. The largest share, 59% or $0.94, was the **brief phase**: the fixed context written to the prompt cache before any work. That is the system prompt, the tool definitions, the User-level skill list, `CLAUDE.md` and `AGENTS.md`, plus the process docs the skill reads. The spike's first request alone wrote 34.9k tokens, $0.70 at Fable's cache-write price.
- **In time, the spike's claim holds.** Setup (29 s) and the final check (55 s) were half of the spike's 168 s of wall-clock time.
- **With real code changes the work dominates**, at 26–41% of cost. The fixed brief still takes 17–30%, code review 15–31%, git and PR 11–13%, tracker calls 10–12%, setup 5–10% and the check 1%.
- **Writing new content to the cache costs more than reading the cache.** Cache writes are 69–71% of a trivial run's cost and 33–38% of a code run's. Every run writes at the one-hour cache rate, twice the input price. So what a run _adds_ to its context matters more than how many turns it takes.
- **The model is the biggest multiplier.** The same trivial run cost $1.60 on Fable 5.1 (the spike) and $0.61 on Opus 5.5 (T1 readme), because Fable writes the cache at $20 per million tokens against Opus's $8. The runner passes no model, so a run uses the User's default model.

## Method

### Runs measured

These are the five Start runs Tandembike has started on this repository: every log under `~/.claude/projects/-Users-niek-Projects-saartje-ticket*` whose entrypoint is `sdk-ts` or `sdk-cli` and whose first prompt is a Start command.

| Run                                          | Log (`~/.claude/projects/…`)                                                                                                         | Kind                                                      | Model                          | Mode    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------ | ------- |
| T1 spike (throwaway Project, T1060's spike)  | `-Users-niek-Projects-saartje-ticket--claude-worktrees-ticket-1-docs-roadmap/3b464018-4581-4847-95ad-7375225d1823.jsonl`             | trivial: one docs line, to a PR                           | Fable 5.1                      | auto    |
| T1 readme (throwaway Project, T1098's check) | `-Users-niek-Projects-saartje-ticket--claude-worktrees-t1098--claude-worktrees-t1-readme/efa8f02c-73e1-41c1-9728-a07e9258561f.jsonl` | trivial: one README line, committed, no push              | Opus 5.5                       | default |
| T622                                         | `-Users-niek-Projects-saartje-ticket/c78e6677-039b-4ae8-b196-d30257808a85.jsonl` (+ 2 subagent logs)                                 | code: brief change with tests and an ADR line, merged     | Opus 5.5, Sonnet 5.5 reviewers | default |
| T623                                         | `-Users-niek-Projects-saartje-ticket/73b9cb90-e7d3-4c71-ad3f-8388f385e84e.jsonl` (+ 2 subagent logs)                                 | code: MCP tool change with tests and a live check, merged | Opus 5.5, Sonnet 5.5 reviewers | default |
| T629                                         | `-Users-niek-Projects-saartje-ticket/919d6256-a121-4516-b186-023e8627cb1c.jsonl` (+ 2 subagent logs)                                 | docs: one tracker-doc paragraph, reviewed, merged         | Opus 5.5, Sonnet 5.5 reviewers | default |

T622, T623 and T629 (2026-11-01) ran the older `mattpocock-skills:implement` skill. Their review step ran `code-review` even for docs-only changes. The User replied in each of them to merge, so the merge turns are included. Two windows are left out: the spike's two probe replies after its PR (after 23:03:02), and a `/grilling` detour in T623 (12:23:05 to 12:26:59).

Three terminal sessions that ran `/implement` by hand on the current skill (T630, T1134, T1133; same folder, `798358e0…`, `50b331b1…`, `edea294f…`) appear in a last table for comparison. They are not Start runs: no brief, and no worktree.

### Cost

Each log has one `assistant` entry per content block of an API response, all with the same message id and usage. Usage is counted once per id. Cost per request is input, output, cache reads and cache writes (five-minute or one-hour) at these prices per million tokens:

| Model      | Input | Output | Cache read | 5 min write | 1 h write |
| ---------- | ----: | -----: | ---------: | ----------: | --------: |
| Opus 5.5   |     4 |     20 |       0.20 |           5 |         8 |
| Fable 5.1  |    10 |     50 |       0.25 |        12.5 |        20 |
| Sonnet 5.5 |     2 |     10 |       0.10 |         2.5 |         4 |

The Opus and Fable rows reproduce the logs' own `cost-state` entries to the cent. The Sonnet read and write prices were solved from three runs' `cost-state` and fit all three exactly. The totals match Tandembike's stored Conversation cost: T622 $1.18, T629 $0.88, and T623 $2.14 with the detour included. The two throwaway runs' databases are gone, so they were checked against `cost-state` instead: $1.78 for the spike with its probes, $0.61 for T1 readme. Main-thread cache writes are all one-hour writes; the review subagents' writes are five-minute writes.

### Phases

Each request is put in the phase of the tool calls it makes. A request that calls tools in several phases is split equally between them. A text-only request takes the phase of the request before it.

| Phase   | Tool calls                                                                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| brief   | the first request (system prompt, tools, skill and instruction attachments); `Skill` other than `code-review` and `pr`; `ToolSearch`; reading `docs/agents/`, `AGENTS.md`, `CLAUDE.md`, `GLOSSARY.md`, `docs/adr/` or a skill file |
| tracker | every `mcp__tandembike__*` tool                                                                                                                                                                                                    |
| setup   | `git fetch`, `git worktree add`, `git checkout -b`, `npm ci`, `npm install`, `npm rebuild`, `EnterWorktree`; and teardown: `ExitWorktree`, `git worktree remove`, `prune`                                                          |
| work    | everything else: reading code, editing, single test files, typecheck, Biome during the work                                                                                                                                        |
| check   | a Bash command that starts with `npm run check`                                                                                                                                                                                    |
| review  | `Skill` `code-review`, `Agent`, the reviewers' subagent logs, code-review's `git rev-parse` / `git log origin/main..HEAD`, browser checks                                                                                          |
| git/PR  | other `git` and `gh` commands (commit, push, `gh pr create`, `checks`, `merge`, `pull`), `Skill` `pr`                                                                                                                              |
| rebuild | a cache write that re-caches old context after the cache expired during a long wait                                                                                                                                                |

A Bash call is classified by its first line, never by heredoc or PR-body text.

A request's cost has two parts. Reading the context and generating (input, cache reads, output) goes to its own phase. Its cache write is mostly the previous request's tool results, so it goes to the phase of the previous request: a big `get_ticket` result or doc read is paid in the next request. When the cached prefix shrinks by more than 20% from one request to the next, the cache has expired, and that rewrite goes to `rebuild`.

Wall-clock time per phase: model time before a request goes to that request's phase, and tool time after it goes to the phase of the request that called the tool. Gaps over two minutes are left out and reported separately (the User, CI, or a background agent).

Every run except the spike ran in `default` mode, so its wall-clock includes the User approving prompts: 17 in T622, 30 in T623, 6 in T629. Tandembike records when a prompt was asked but not when it was answered, so shorter waits cannot be separated out. The spike ran in auto mode with no prompts and is the clean reference for time.

### Repeating it

`start-run-cost-phases.py`, next to this file, implements the rules above over the logs named in it. `--trace` prints every request with its phase, `--json` the numbers, `--durations` the run time of each setup and check command. To measure new runs, add their logs to `RUNS`, with excluded windows for replies outside the Ticket's work.

## Findings

### Per run

Tokens are summed over the phase's requests: Input is uncached input, Cached is cache reads, Written is cache writes.

**T1 spike**: $1.60, 12 requests, 168 s.

| Phase   | Turns | Input | Cached | Written | Output |  Cost | Share | Wall s |
| ------- | ----: | ----: | -----: | ------: | -----: | ----: | ----: | -----: |
| brief   |   2.3 |    60 |  84.8k |   43.7k |    834 | $0.94 |   59% |     14 |
| tracker |   4.2 |   118 | 188.1k |    5.7k |   2.1k | $0.27 |   17% |     32 |
| setup   |   2.3 |    75 |  94.7k |    3.3k |   1.6k | $0.17 |   11% |     29 |
| work    |   0.5 |    16 |  22.2k |    1.3k |    905 | $0.08 |    5% |     19 |
| check   |   1.0 |    32 |  49.5k |     389 |    118 | $0.03 |    2% |     55 |
| git/PR  |   1.7 |    23 |  87.3k |    2.5k |   1.0k | $0.12 |    8% |     20 |

**T1 readme**: $0.61, 12 requests, 155 s. Its tracker and setup time include about 95 s of waiting for the User to approve `git worktree add`, which ran in the same request as a tracker call.

| Phase   | Turns | Input | Cached | Written | Output |  Cost | Share | Wall s |
| ------- | ----: | ----: | -----: | ------: | -----: | ----: | ----: | -----: |
| brief   |   1.8 |     4 |  57.7k |   40.0k |    458 | $0.34 |   56% |      7 |
| tracker |   6.3 |    15 | 274.6k |    9.0k |   3.2k | $0.19 |   31% |     87 |
| setup   |   1.8 |     4 |  81.4k |    2.9k |    497 | $0.05 |    8% |     55 |
| work    |   1.0 |     2 |  48.9k |     244 |    130 | $0.01 |    2% |      3 |
| git/PR  |   1.0 |     2 |  49.2k |     235 |    211 | $0.02 |    3% |      3 |

Its tracker share includes filing one feedback Ticket.

**T622**: $1.18, 35 requests, 405 s active plus 527 s of gaps.

| Phase   | Turns | Input | Cached | Written | Output |  Cost | Share | Wall s |
| ------- | ----: | ----: | -----: | ------: | -----: | ----: | ----: | -----: |
| brief   |   5.5 |    13 | 249.3k |   26.2k |   1.2k | $0.28 |   24% |     21 |
| tracker |   5.5 |    12 | 298.3k |    4.8k |    953 | $0.12 |   10% |     57 |
| setup   |   2.0 |     5 | 118.8k |    1.6k |   1.1k | $0.06 |    5% |     48 |
| work    |  12.0 |    24 | 552.3k |   13.9k |   4.5k | $0.31 |   26% |    156 |
| check   |   1.0 |     2 |  50.5k |     408 |    165 | $0.02 |    1% |     66 |
| review  |   3.0 |     8 | 158.0k |    6.1k |   1.5k | $0.26 |   22% |     22 |
| git/PR  |   6.0 |    14 | 373.7k |    3.6k |   1.7k | $0.14 |   12% |     34 |

**T623**: $1.78, 57 requests, 576 s active plus 288 s of gaps.

| Phase   | Turns | Input |  Cached | Written | Output |  Cost | Share | Wall s |
| ------- | ----: | ----: | ------: | ------: | -----: | ----: | ----: | -----: |
| brief   |   5.0 |    11 |  245.0k |   27.7k |   1.2k | $0.30 |   17% |     19 |
| tracker |   5.8 |    13 |  439.3k |    6.2k |   2.5k | $0.19 |   11% |     44 |
| setup   |   4.8 |    10 |  297.6k |    2.5k |    864 | $0.10 |    5% |     37 |
| work    |  30.0 |    60 | 1634.2k |   24.9k |   9.9k | $0.72 |   41% |    266 |
| check   |   1.0 |     2 |   67.0k |     476 |    213 | $0.02 |    1% |     31 |
| review  |   3.0 |     8 |  206.3k |    6.8k |   1.8k | $0.27 |   15% |     37 |
| git/PR  |   7.3 |    21 |  572.2k |    4.6k |   1.8k | $0.19 |   11% |    142 |

**T629**: $0.88, 29 requests, 328 s active plus 1,547 s of gaps (mostly approvals).

| Phase   | Turns | Input | Cached | Written | Output |  Cost | Share | Wall s |
| ------- | ----: | ----: | -----: | ------: | -----: | ----: | ----: | -----: |
| brief   |   5.5 |    11 | 201.5k |   25.4k |    994 | $0.26 |   30% |     22 |
| tracker |   5.5 |    15 | 246.5k |    4.5k |    947 | $0.10 |   12% |     44 |
| setup   |   6.0 |    16 | 264.4k |    2.2k |   1.1k | $0.09 |   10% |    130 |
| work    |   2.0 |     4 |  79.0k |     702 |    511 | $0.03 |    4% |      7 |
| review  |   3.0 |     8 | 126.2k |    5.7k |   1.6k | $0.28 |   31% |     27 |
| git/PR  |   7.0 |    18 | 350.4k |    2.2k |   1.4k | $0.11 |   13% |     98 |

T629 had no `npm run check`: it changed one doc. It still ran `code-review` with two reviewers for that paragraph, for 31% of its cost. The current `implement` skill already replaces that review with an inline check for docs-only changes.

### What the brief phase is

The first request of a Start run carries, in render order:

- tool definitions: 35k characters of JSON (45k once T623 loaded the core Tandembike tools up front). The largest are Workflow 5.5k, Agent 5.4k, ScheduleWakeup 4.8k, AskUserQuestion 4.7k, Bash 3.8k and ReportFindings 2.3k;
- the system prompt: 8.3k characters, ending with Tandembike's brief (about 830 characters);
- attachments: the skill list (12.2k characters, 40 skills; 11 are the User's `mattpocock-skills:` plugin copies of skills the repository already has), `CLAUDE.md` and `AGENTS.md` (9.6k), the names of the deferred tools (6.2k), MCP server instructions (5.7k, for both the claude.ai Claude Docs server and Tandembike), the agent types (1.8k) and session context (1.1k);
- the Start command and the `implement` skill text (2.4k).

The runner (`src/conversations/claude-runner.ts`) passes no `model`, `settingSources` or `disallowedTools`. A run therefore gets the User's default model and the User's own plugins, skills and MCP servers, as well as the repository's settings.

On 2026-11-01, T622, T623 and T629 each read 12.9k tokens from the cache on their first request: the tools and the preset system prompt, cached by an earlier session. Each still wrote 14–16k tokens, because the brief ends the system prompt. Everything after it differs from the previous run's request and is written again, even though the skill list, instructions and listings are the same for every run.

After the first request, the brief phase grows by what the skill tells the run to read. `docs/agents/issue-tracker.md` is 15.5k characters. The two trivial runs read it whole; the code runs grepped sections of it two or three times. Each `ToolSearch` that loads a deferred Tandembike tool's schema adds a turn: three or four per run on 2026-11-01, two after T623.

### Setup and the check in time

| Command                                  |  Spike |   T623 |   T629 |
| ---------------------------------------- | -----: | -----: | -----: |
| `git fetch` + `git worktree add`         |  2.9 s |  2.1 s |  2.2 s |
| `npm ci … && npm rebuild better-sqlite3` | 15.3 s | 13.7 s | 42.3 s |
| `npm run check`                          | 52.4 s | 27.4 s |      — |
| teardown                                 |      — |  8.5 s |  2.9 s |

The T623 and T629 figures include the time to approve the prompt. T622 never ran `npm ci`, yet ran the full `npm run check` in `.claude/worktrees/t622`, with 1,728 tests passing. A worktree inside the repository resolves packages from the main checkout's `node_modules` by walking up the folder tree. `browser-checks.md` forbids symlinking `node_modules` only because Turbopack will not resolve packages outside the served folder.

### Code runs and terminal runs

| Run                               |  Cost | brief | tracker | setup | work | check | review | git/PR | rebuild |
| --------------------------------- | ----: | ----: | ------: | ----: | ---: | ----: | -----: | -----: | ------: |
| T630 (terminal, docs)             | $1.19 |   25% |     27% |    6% |  17% |    2% |     2% |    21% |      0% |
| T1134 (terminal, package upgrade) | $2.26 |   10% |     14% |    1% |  39% |    1% |    24% |     9% |      0% |
| T1133 (terminal, component)       | $7.38 |    7% |      5% |    0% |  49% |    1% |    10% |     7% |     20% |

Without a worktree, setup falls to 0–6%. The brief, tracker and git/PR overhead stays: $0.75 to $1.36 per run in these three. T1133 also shows the cost of a long wait. Its cache expired overnight, and the next request re-wrote 187k tokens of context for $1.49, a fifth of the run.

## Candidate cuts, ranked

Estimated saving per run, on Opus 5.5 unless stated; Fable 5.1 is about 2.5 times each figure. The estimates use the measured prices and two rules. A token removed from the fixed context saves its write ($8 per million) plus one read per later turn ($0.20 per million): about $14 per million tokens over a 30-turn run. A turn removed saves about $0.015: one read of a 50k-token context, its output and its small write. Token counts from characters are rough (about four characters per token).

| #   | Cut                                                                        | Saving per run                                                                                                                                                                                                                       | What it would change                                                                                                                     | Rule or ADR it touches                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Run Start on Opus rather than Fable                                        | about $1.00 on a trivial run (the spike's $1.60 against T1 readme's $0.61), about 60% of any run                                                                                                                                     | a model for runs: a per-Project setting passed as `model`, or a `model` in the repository's committed settings                           | ADR 0019 (a run loads the repository's settings, so a committed `model` also changes the User's terminal sessions); a quality trade-off that is the User's call. The User's default was already Opus for T1 readme (2026-11-08), so this applies only while the default is Fable       |
| 2   | Let consecutive runs share the fixed context in the cache                  | up to $0.11 ($0.28 on Fable) when the next run starts within an hour, which is Autopilot's case                                                                                                                                      | move the run-specific facts out of the end of the system prompt, so that everything the runs share comes before anything that differs    | ADR 0019's brief, and T621's rule that the command starts the first message. **Unverified:** it depends on whether Claude Code puts the attachments before or after the first message's text, which the logs do not show. Check with two throwaway runs a minute apart before building |
| 3   | Shared, pre-prepared worktree per Project                                  | $0.05–0.10 (the whole setup phase; $0.17 on Fable), and 7–60 s                                                                                                                                                                       | Tandembike, or a hook, keeps one ready worktree per Project and hands it to the run                                                      | **ADR 0019: "Tandembike never runs git and does not track worktrees."** Left open for the User: is a prepared worktree acceptable, given that rule? Cuts 7 and 8 get most of the saving without changing the ADR                                                                       |
| 4   | Leave the User's own plugins, skills and unrelated MCP servers out of runs | about $0.07 ($0.15 on Fable): roughly 5k tokens. That is the `mattpocock-skills:` copies, unused tools (Workflow, ScheduleWakeup, ReportFindings, Cron*), and the Claude Docs instructions                                           | the runner passes `settingSources` without `user`, or `disallowedTools`; or the User disables those plugins for runs                     | ADR 0019 promises the repository's instructions, settings and skills, not the User's. It would break a Start command that names a User plugin skill, such as the `/mattpocock-skills:implement` used on 2026-11-01                                                                     |
| 5   | Shorter process reading at the start                                       | about $0.04 ($0.07 on Fable) and a turn: read 1–2k tokens instead of the 3.9k tracker doc                                                                                                                                            | a short Start-run section the `implement` skill points to, or split the tracker doc so the run reads only Claims, Status and the PR rule | `implement` skill step 1; `docs/agents/issue-tracker.md`; ADR 0014 (the server explains the tracker, the doc adds only process)                                                                                                                                                        |
| 6   | Fewer tracker and `ToolSearch` turns                                       | about $0.03 ($0.07 on Fable): two turns. Load up front the deferred Tandembike tools every Start run calls (`set_acceptance_criteria_checked`, `release_ticket_claim`, `complete_ticket`); claim and move to In progress in one call | tool loading in `src/mcp/mcp-server.ts`, as T623 did for the core tools; possibly `claim_ticket` taking a Status                         | ADR 0014 and ADR 0021 (the tools a run pre-allows); the tracker doc's claim steps                                                                                                                                                                                                      |
| 7   | Fewer, combined setup commands                                             | $0.02–0.04: one to three turns. Fetch, add and prepare in one command, enter, and tear down in one command                                                                                                                           | the "Worktrees for parallel runs" section, possibly a script in the repository                                                           | `docs/agents/issue-tracker.md` only                                                                                                                                                                                                                                                    |
| 8   | Skip `npm ci` when the lockfile matches the main checkout's                | $0.01–0.02 and 14–42 s                                                                                                                                                                                                               | "Prepare it": install only when `package-lock.json` differs from the main checkout's, or when the run will serve the app                 | `docs/agents/issue-tracker.md` "Prepare it"; `browser-checks.md` keeps its install for Turbopack. Only valid for a worktree under `.claude/worktrees/`, inside the repository                                                                                                          |
| 9   | Leave the full check to CI                                                 | $0.02–0.03, but 27–55 s (a third of the spike's time)                                                                                                                                                                                | the `implement` skill runs single test files and leaves `npm run check` to the pre-commit hook (Biome and typecheck) and CI              | `AGENTS.md` "Before finishing"; `implement` skill step 3. **Not recommended on cost:** one red CI run costs more turns than the check saves                                                                                                                                            |

Already in place: `implement` step 4 checks docs-only changes inline rather than running `code-review`, which cost T629 $0.28. Cuts 4 to 8 together would save about $0.19 per Opus run: about 30% of a trivial run and 10–15% of a code run.

Out of scope here: code review (15–31% of a code run) and the work itself. Review is the quality gate, and the work is what the run is for.

## Open question for the User

Is a shared, pre-prepared worktree per Project acceptable under ADR 0019, which says Tandembike never runs git and does not track worktrees? It would save the whole setup phase, $0.05–0.10 per Opus run. Cuts 7 and 8 reach most of that by changing only the repository's own docs.
