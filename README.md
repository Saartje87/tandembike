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

Open [http://localhost:3000](http://localhost:3000) in your browser. The
database is created and migrated automatically on first use; there is no
separate setup step.

## Connect an Agent

The MCP server is served by the running app at
`http://localhost:3000/api/mcp`. To register it with Claude Code:

```bash
claude mcp add --transport http tandembike http://localhost:3000/api/mcp
```

Keep `npm run dev` (or `npm run start`) running while the Agent works. The
server's instructions ask Agents to move a Ticket to In progress when they
start it and to Done when they finish, to reuse existing Projects, and to
refer to Tickets as `#42`.

## Where data lives

All data is stored in a single SQLite file in the `data/` folder at the repo
root. The folder is git-ignored, so your Tickets are never committed. To back
up, copy the folder; to start fresh, stop the app and delete it.

## Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local development server (localhost only) |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |
| `npm test` | Run the tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run ts` | Check TypeScript types |
| `npm run lint` | Check the code with Biome |
| `npm run check` | Run lint, type checking, and tests |
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
