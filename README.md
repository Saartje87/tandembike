# Tandembike

A small ticket tracker that runs on your own machine. You (the single User)
organise Tickets into Projects and move them across a Board of Statuses:
`Todo`, `In progress` and `Done`. AI Agents such as Claude Code work with the
same Tickets through an MCP server built into the app, and the Board updates
live when an Agent makes a change.

The app is local-only: it binds to localhost and has no login, accounts or
permissions (see `docs/adr/0001-local-only-no-auth.md`).

## Getting started

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
`--`, for example `npm run dev -- -p 4848` (the same works for
`npm run start`). If the port is taken, the server stops with an
"address in use" error instead of moving to another port, because the MCP URL
is fixed: when you change the port, register the MCP server with the same
port (`http://localhost:<port>/api/mcp`).

## Connect an Agent

The MCP server is served by the running app at
`http://localhost:4747/api/mcp`. This repository's `.mcp.json` registers it
for Claude Code in this checkout; to reach it from every repository, register
it once at user level as described in the next section.

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
instructions explain how the tracker works, so a repository only needs to
name its Project (see `docs/adr/0014-server-explains-tracker.md`).

**1. Register the server once, for all repositories.** Keep the app running
on `localhost:4747`, then register it at user level for each client you use:

- **Claude Code:**

  ```bash
  claude mcp add --scope user --transport http tandembike http://localhost:4747/api/mcp
  ```

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

**2. Name the repository's Project in its `AGENTS.md`.** Add one line, with
the Project's name as it shows in the app:

```markdown
Tickets for this repository live in the Tandembike Project `Shop` (MCP server `tandembike`).
```

Copilot reads `AGENTS.md` itself. Claude Code reads `CLAUDE.md`, so a
repository that has no `CLAUDE.md` yet gets one containing just:

```markdown
@AGENTS.md
```

Anything else about how that repository works with Tickets (branches, when a
Ticket is done, triage) belongs in its own `AGENTS.md`;
`docs/agents/issue-tracker.md` is this repository's example.

## Where data lives

All data is stored in a single SQLite file in the `data/` folder at the repo
root. The folder is git-ignored, so your Tickets are never committed. To back
up, copy the folder; to start fresh, stop the app and delete it.

## Available commands

| Command               | Description                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------- |
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
