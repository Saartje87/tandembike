# Tandembike

A small ticket tracker that runs on your own machine. You (the single User)
organise Tickets into Projects and move them across a Board of Statuses:
`Todo`, `In progress` and `Done`. AI Agents such as Claude Code work with the
same Tickets through an MCP server built into the app, and the Board updates
live when an Agent makes a change.

The app is local-only: it has no login, accounts or permissions (see
`docs/adr/0001-local-only-no-auth.md`), so it makes sure only this machine can
reach it (see `docs/adr/0022-local-only-enforced-in-four-layers.md`):

- `npm run dev` and `npm run start` run a small custom server (`server.ts`)
  that listens on `127.0.0.1` and `::1` only. There is no option to listen on
  another address.
- It refuses any connection from another address with a 403 and logs it.
- It refuses requests for any Host other than `localhost`, `127.0.0.1` or
  `[::1]`, against DNS rebinding.
- It refuses requests whose `Origin` is not the app's own, so other websites
  open in your browser cannot call the MCP server or other routes. Requests
  without an `Origin`, as CLI MCP clients send them, pass.

Start the app with the npm scripts: running `next dev` or `next start`
directly skips the first two guards.

## Install and start

Tandembike installs from its checkout; nothing is published to npm. In a clone,
run once:

```bash
npm run setup
```

This runs `npm ci`, `npm run build` and `npm link`, which adds a global
`tandembike` command. From then on, `tandembike start` in any folder starts the
app in the background on [http://localhost:4747](http://localhost:4747), with
its database in `~/.tandembike/`, and returns once it answers. On the first
run, when `~/.tandembike/ticket.db` is missing and the checkout has
`data/ticket.db`, the command copies that database (with any `-wal` and `-shm`
files) and says so. It never moves, deletes or overwrites a database.

| Command                         | Does                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `tandembike start [-p <port>]`  | Start the server in the background; says "already running" when it is          |
| `tandembike start --foreground` | Serve in this terminal instead, to watch or debug it                           |
| `tandembike stop [--force]`     | Stop the server `tandembike start` started, and wait until it is gone          |
| `tandembike restart`            | Stop, then start on the same port (after `git pull` and `npm run build`)       |
| `tandembike status`             | pid, URL, uptime and log path; exits 1 when nothing runs                       |
| `tandembike logs [-f]`          | The last 100 lines of `~/.tandembike/server.log`; `-f` follows it until Ctrl+C |
| `tandembike help`               | Every command                                                                  |

`start` records the server in `~/.tandembike/server.json` (pid, port and start
time) and appends its output to `~/.tandembike/server.log`. On each start the log
gets a "started at …" line, after rolling over to `server.log.1` once it passes
5 MB. Pass `-p <port>` to
use another port; the other commands find it from `server.json` (or
`TANDEMBIKE_URL` when set). `start` refuses with "run `npm run build` first"
when the checkout has no production build. `stop` and `status` never touch a
server they did not start, such as `npm run dev`: `status` reports it as
running, not started by `tandembike start`, and `stop` refuses it.

See `docs/adr/0035-tandembike-installs-from-its-checkout.md` and
`docs/adr/0052-the-cli-runs-the-server-in-the-background.md`.

## Getting started (development)

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:4747](http://localhost:4747) in your browser. The
database is created and migrated automatically on first use; there is no
separate setup step.

The app runs on port 4747 by default, so it does not clash with other Next.js
projects on the default 3000. To run it on another port once, pass it after
`--`, for example `npm run dev -- -p 4848` or `npm run dev -- --port 4848`
(the same works for `npm run start`). The port is the only option. If the port is taken, the server stops with an
"address in use" error instead of moving to another port, because the MCP URL
is fixed: when you change the port, register the MCP server with the same
port (`http://localhost:<port>/api/mcp`).

## Work a Ticket in your terminal

With Tandembike running, `tandembike implement T42` (or `tandembike implement
42`) in any folder opens interactive `claude` on that Ticket or Epic, whatever
the folder is: the Ticket's Project says where. Tandembike makes the run's worktree and runs
the Prepare command as for a Start from the UI (with Parallel runs on), then
opens `claude` there with the Stage's command (`/tandembike:implement T42`
unless the Project sets its own), the run brief, the bundled Playbook, the
Project's run mode and model, and `TANDEMBIKE_RUN` set to the Conversation's
id. You answer permission prompts and questions in the terminal.

The other Stages work the same way: `tandembike triage T42` opens a Triage
session and `tandembike spec T42` a Spec session, both in the main checkout
with the Stage's command. Spec is refused unless the Ticket is an idea in
Intake or an Epic without children. `tandembike plan "<goal>"` takes the Project whose repository holds the
current folder and opens a Plan session in its main checkout, with the Plan
command and the goal as the first message; from a folder in no Project's
repository it names the known Projects. `tandembike implement` without a
Ticket takes the Project whose repository holds the current folder and starts
a Terminal Start on the top
Eligible item of its Active Cycle, the rule of `next_work`; with none it says
why, and from a folder in no Project's repository it names the known Projects.

The Conversation shows on the Board as In flight, **Started by Terminal**. It
holds no Start run slot and counts against no Spend ceiling, and Autopilot does
not start a second run on its Ticket. It ends when `claude` exits, and
the command exits with `claude`'s exit code. When Tandembike is not running, the
command starts it in the background first (without the MCP and plugin offers)
and says so in one line, `Started Tandembike on :4747 (logs: …)`; when that
start fails it prints why, the log path and the `tandembike start` hint, and
exits 1. The same holds for `triage`, `spec`, `plan` and `resume`. See
`docs/adr/0039-terminal-conversations.md`.

### Continue a Conversation in your terminal

A Conversation you started in the UI that has an SDK session shows **Continue
in terminal** in its header, which copies `tandembike resume <id>`. Run it in
any folder: Tandembike stops the live run (its Run outcome is recorded as
stopped and its pending prompts expire), appends "Continued in terminal", and
the Conversation becomes Started by Terminal and `running`. Its cost so far and
Autopilot Cycle stay. The command then runs `claude --resume <session id>` in
the Conversation's worktree, or in the Project's repository when it has none,
with the bundled Playbook and `TANDEMBIKE_RUN` set, and reports the end when
`claude` exits. It is refused, with the reason, for a closed Conversation, one
without an SDK session, one already in a terminal and one whose worktree was
removed.

## Install the Playbook plugin

The checkout is also a Claude Code marketplace named `tandembike`
(`.claude-plugin/marketplace.json`) whose one plugin is the bundled Playbook
(`./playbook`), so installing needs no network. The offer is made only when
`tandembike start` starts the server: on the first run, and on any later start where
the installed plugin is older than the bundled Playbook. It offers to run:

```bash
claude plugin marketplace add <this checkout>
claude plugin install tandembike@tandembike --scope user
```

(or, for an older install, `claude plugin marketplace update tandembike` and
`claude plugin update tandembike@tandembike`). You confirm each offer; with no
`claude` on `PATH` it prints the steps. `tandembike plugin` makes the offer
again at any time. Afterwards `/tandembike:implement T42` and the other
Playbook commands work in a bare `claude` session in any repository. The
session subcommands (`implement`, `triage`, `spec`, `plan`, `resume`) never make
the offer: they load the bundled Playbook themselves, so they do not depend on
this install.

## Connect an Agent

The MCP server is served by the running app at
`http://localhost:4747/api/mcp`. `tandembike start` offers to register it
for Claude Code at user level on its first start, so every repository reaches
it; to register it yourself, or for other clients, see the next section. This
repository's own `.mcp.json` registers it only for development in this
checkout.

Keep `npm run dev` (or `npm run start`) running while the Agent works. The
server's instructions explain the tracker to Agents: moving a Ticket to In
progress and Done, Claims, acceptance criteria, Blockers, Epics and Cycles,
using the Project their repository names, and referring to Tickets as `T42`.

An Agent session keeps the tools it loaded when it connected. After you pull
or merge changes to the MCP tools, start a new session: reconnecting (`/mcp`
in Claude Code) may keep the tool descriptions already loaded. See "When the
MCP tools change" in `docs/agents/issue-tracker.md`.

## Use Tandembike from another repository

One running app serves every repository on this machine: give each repository
its own Project, and its Agents keep their Tickets there. The MCP server's
instructions explain how the tracker works. A tool that takes a Project uses
the one whose repository contains the Agent's working folder, so a repository
names its Project nowhere (see
`docs/adr/0036-mcp-calls-default-to-the-project-of-the-callers-folder.md`).
Set each Project's repository folder when you create it, or on its agent
settings.

**1. Register the server once, for all repositories.** Keep the app running
on `localhost:4747`, then register it at user level for each client you use:

- **Claude Code:**

  ```bash
  claude mcp add --scope user --transport http tandembike http://localhost:4747/api/mcp --header 'X-Tandembike-Cwd: ${PWD}' --header 'X-Tandembike-Run: ${TANDEMBIKE_RUN:-}'
  ```

  Keep the single quotes: Claude Code expands `${PWD}` to the folder each
  session starts in, which is how Tandembike finds that folder's Project.

- **GitHub Copilot CLI:**

  ```bash
  copilot mcp add --transport http tandembike http://localhost:4747/api/mcp
  ```

  This writes `~/.copilot/mcp-config.json` (or `$COPILOT_HOME/mcp-config.json`).

- **GitHub Copilot in VS Code:** run **MCP: Add Server** from the Command
  Palette, choose **HTTP**, enter `http://localhost:4747/api/mcp` and the ID
  `tandembike`, then **Global** and **Copilot Global**. That writes the same
  `~/.copilot/mcp-config.json`, so a server added in either Copilot client
  shows up in the other.

After registering, start a new session (or reconnect, `/mcp` in Claude Code)
so the client loads the tools.

**2. Give the repository a `CLAUDE.md` that loads its `AGENTS.md`.** Copilot
reads `AGENTS.md` itself. Claude Code reads `CLAUDE.md`, so a repository that
has no `CLAUDE.md` yet gets one containing just:

```markdown
@AGENTS.md
```

Anything else about how that repository works with Tickets (branches, when a
Ticket is done, triage) belongs in its own `AGENTS.md`;
`docs/agents/issue-tracker.md` is this repository's example.

## Where data lives

All data is stored in a single SQLite file. The installed `tandembike` command
keeps it in `~/.tandembike/`. `npm run dev` and `npm run start` keep it in the
`data/` folder at the repo root, unless `TANDEMBIKE_DATA_DIR` names another
folder. Both are outside git, so your Tickets are never committed. To back up,
copy the folder; to start fresh, stop the app and delete it.

## Available commands

| Command               | Description                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `npm run setup`       | Install, build and link the global `tandembike` command                                   |
| `npm run dev`         | Start the local development server on `localhost:4747`                                    |
| `npm run build`       | Create a production build                                                                 |
| `npm run start`       | Serve the production build on `localhost:4747`                                            |
| `npm test`            | Run the tests once                                                                        |
| `npm run test:watch`  | Run tests in watch mode                                                                   |
| `npm run ts`          | Check TypeScript types                                                                    |
| `npm run lint`        | Check the code with Biome                                                                 |
| `npm run check`       | Run lint, type checking, and tests                                                        |
| `npm run db:generate` | Write a migration after changing `src/db/schema.ts` (applied automatically on next start) |

## Project structure

- `src/app/` contains pages, layouts and route handlers, including the MCP
  (`/api/mcp`) and live-update events (`/api/events`) routes.
- `src/tickets/` contains the Tickets module, the only code that reads or
  writes Projects and Tickets.
- `src/mcp/` contains the MCP server: its tools and instructions, which call
  the Tickets module only.
- `src/db/` contains the Drizzle schema, migrations and database connection.
- `src/components/` contains UI components.
- `GLOSSARY.md` defines the domain language; `docs/adr/` records design
  decisions; `docs/` also holds setup notes and component guides.

## Tech stack

Next.js with the App Router, React and TypeScript. The interface uses
[Blockle Blocks](https://www.npmjs.com/package/@blockle/blocks) with the Momotaro theme and Vanilla
Extract for styles. Data is stored in SQLite through Drizzle ORM, Agents
connect through the Model Context Protocol, and live updates use
Server-Sent Events.
