# A local plugin per run through the Agent SDK (spike, T1205)

Question: can Tandembike ship its Playbook as a Claude Code plugin that it loads into each run through the Agent SDK's `plugins` option, with the plugin's skills run as commands at the start of the first message, as today's Agent commands are (ADR 0019)? This is the "Plugins through the SDK" risk in [`software-factory-2.md`](../roadmap/software-factory-2.md), which [ADR 0032](../adr/0032-tandembike-ships-a-default-playbook.md) rests on.

Date: 2026-11-08. Claude Agent SDK 0.3.316 with its bundled Claude Code 2.1.316 for the SDK runs; Claude Code 2.1.319 (the User's `claude` on `PATH`) for the terminal session and the `claude plugin` commands. Model `claude-haiku-5-5`.

## Method

Everything lived in a throwaway folder, `/tmp/t1205/`, outside any repository:

- `plugin/`: a plugin named `tandembike-spike` (`.claude-plugin/plugin.json`) with one skill, `skills/hello/SKILL.md`, set to `disable-model-invocation: true`. Its body tells the model to reply `MARKER: PLUGIN-HELLO $ARGUMENTS`, count its `mcp__tandembike*` tools, call `list_projects` once, and quote a secret word from the repository's `CLAUDE.md` from context, without reading any file.
- `repo/`: a fresh git repository whose `CLAUDE.md` holds the secret word `PELICAN-7`. It has no `.claude/` folder, except in the shadowing runs, which add `.claude/skills/hello/SKILL.md` replying `MARKER: REPO-HELLO $ARGUMENTS`.
- `market/`: a local marketplace (`.claude-plugin/marketplace.json`, a `source: "./plugin"` entry) over a copy of the plugin, for question 5.
- `scripts/spike.mjs`: one `query()` call with the options `src/conversations/claude-runner.ts` passes today (`cwd`, `permissionMode: 'default'`, `allowedTools: ['mcp__tandembike']`, the Tandembike HTTP MCP server on port 4747, the `claude_code` preset with an appended prompt, default `settingSources`), plus `plugins: [{ type: 'local', path: '/tmp/t1205/plugin' }]`. The prompt is a plain string that starts with the command. It printed the init message's `plugins`, `slash_commands` and `skills`, every tool call and the result.
- For question 5: `expect` drove an interactive `claude` in a pseudo-terminal. It typed the command's prefix to see the `/` menu, then ran the command.

The User's `~/.claude/settings.json`, `plugins/known_marketplaces.json` and `plugins/installed_plugins.json` were copied before the user-scope install and compared after removal (see Clean-up).

## Findings

### 1. Does the run see the plugin's skills?

Yes. The init message lists the plugin as `{"name":"tandembike-spike","path":"/tmp/t1205/plugin","source":"tandembike-spike@inline"}`, and both `slash_commands` and `skills` contain `tandembike-spike:hello`. The repository's `.claude/` knew nothing of it. With the default `pluginsTransport: 'argv'` the SDK passes it as `--plugin-dir`. `'initialize'` sends the list over stdin instead, which keeps a long plugin list off the command line (needed on Windows).

The User's own user-scope plugins load as well (here `mattpocock-skills`), because the runner keeps the default setting sources.

### 2. Does a first message starting with the namespaced command run the skill?

Yes. `/tandembike-spike:hello T1` as the first message ran the skill with `T1` as its arguments, and the reply was `MARKER: PLUGIN-HELLO T1`. The transcript shows the same `<command-name>/tandembike-spike:hello</command-name>` expansion a repository skill gets. `disable-model-invocation: true` does not stop the User's message from invoking the skill, as with repository skills today (T621).

A bare `/hello T4` also ran the plugin's skill when no other `hello` existed.

### 3. With a repository skill of the same name, which runs?

They do not collide. With both present, `slash_commands` lists `hello` (the repository's) and `tandembike-spike:hello` (the plugin's):

| First message                | Ran                                |
| ---------------------------- | ---------------------------------- |
| `/tandembike-spike:hello T2` | the plugin's (`PLUGIN-HELLO T2`)   |
| `/hello T3`                  | the repository's (`REPO-HELLO T3`) |

So a Project's Agent command can still point at the repository's skill. A bare name means the repository's skill when it has one, and the namespaced name always means the Playbook's.

A bare name is not a safe way to reach the Playbook, though. With a plugin skill `implement` added, a bare `/implement T6` ran the plugin's skill and not `mattpocock-skills:implement`, which the User has installed at user scope. That resolution order is undocumented, and it would change as soon as a repository adds an `implement` of its own.

### 4. Does the plugin's skill see the run's MCP tools and the repository's `CLAUDE.md`?

Yes, both. The skill reported 42 `mcp__tandembike` tools (5 loaded, the rest deferred behind `ToolSearch`). It loaded `list_projects` and called it (`PROJECTS: 5`), and quoted `PELICAN-7` from the repository's `CLAUDE.md` without reading a file. The skill runs in the main session, so it sees what the session sees.

### 5. Does a user-scope install from a local marketplace work in an interactive terminal session?

Yes. `claude plugin marketplace add /tmp/t1205/market` and `claude plugin install tandembike-spike@tandembike-spike-market --scope user` added a `directory` marketplace to `extraKnownMarketplaces` and enabled the plugin under `enabledPlugins` in `~/.claude/settings.json`. In an interactive `claude` session, typing `/tandembike-spike:hel` showed `/tandembike-spike:hello (tandembike-spike) Spike skill for T1205…` in the `/` menu. Running `/tandembike-spike:hello T5` replied `MARKER: PLUGIN-HELLO T5`, with the 42 Tandembike tools and `PROJECTS: 5`. That session ran in a folder Claude Code already trusted, to avoid writing a new trust entry, so its `CLAUDE.md` answer is not part of this result. Question 4 covers it.

Three details for phase 10:

- The install copies the plugin into `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, although `claude plugin list` says "Read from" the source folder. A terminal session therefore keeps the installed version until the plugin's `version` changes and `claude plugin update` runs. A Playbook change that ships with Tandembike does not reach terminal sessions on its own.
- With the same plugin both installed at user scope and passed through the SDK's `plugins` option, the SDK run loaded only the inline copy: the init message listed `tandembike-spike@inline` alone, and the inline skill ran. A stale user-scope install does not shadow the copy Tandembike bundles.
- An isolated `CLAUDE_CONFIG_DIR` installs and lists plugins fine, but has no sign-in, so it cannot start a session. A real check needs the User's config.

## Verdict

**Build ADR 0032 as written.** Every assumption holds: the SDK loads a local plugin per run with no trace in the repository, its skills run as first-message commands, they see the run's MCP tools and the repository's `CLAUDE.md`, a repository's skill of the same name stays reachable for overrides, and a user-scope install gives terminal sessions the same commands.

Three things to settle while building it:

1. **Always send the namespaced command for the Playbook**, such as `/tandembike:implement T42`, never a bare `/implement`. A bare name resolves to the repository's skill, then the inline plugin, and the User's own plugins (`mattpocock-skills` has `implement`, `tdd` and `triage`) sit in the same namespace. A Project's override stays whatever command the User enters.
2. **Name the plugin `tandembike`**, so the commands read `/tandembike:<stage>`, as the roadmap already writes them (`/tandembike:start T42`).
3. **Phase 10 must keep the user-scope copy current**: bump the plugin `version` with each Playbook change, and have Tandembike run `claude plugin update` (or tell the User to), since the install is a cached copy. SDK runs are unaffected because the inline copy wins.

## Clean-up

The User approved installing into their real config for question 5, after the auto-mode classifier refused it. The plugin was uninstalled and the marketplace removed. `settings.json` and `installed_plugins.json` match the copies taken before. In `known_marketplaces.json` the only difference is the `claude-plugins-official` marketplace's `lastUpdated`, which Claude Code refreshed on its own. The plugin's cache folder was removed. `~/.claude.json` keeps two usage counters Claude Code wrote, `pluginUsage["tandembike-spike@inline"]` and `skillUsage["tandembike-spike:hello"]`. They are not settings and change no behaviour, and were left alone rather than edited under a running session. `/tmp/t1205/` was deleted after this file was written.
