# Tandembike installs from its checkout and keeps its data in ~/.tandembike

Amended on 2026-11-10 by [ADR 0052](0052-the-cli-runs-the-server-in-the-background.md): bare `tandembike` no longer serves; `tandembike start` runs the server in the background and `tandembike stop` stops it.

Decided on 2026-11-08 (T1192, phase 6 of [`software-factory-2.md`](../roadmap/software-factory-2.md)). Builds on [ADR 0022](0022-local-only-enforced-in-four-layers.md) and [ADR 0020](0020-setup-advises-the-user-decides.md).

Tandembike ran only from its own checkout, with its database in the checkout's `data/` folder found from the working directory. To serve every repository on the machine it must run from anywhere, and its data must survive a fresh clone.

`npm run setup` runs `npm ci`, `npm run build` and `npm link`, adding a global `tandembike` command (a `bin` entry, a Node script with no new dependencies). The command runs the production server from the checkout on port 4747 with `TANDEMBIKE_DATA_DIR=~/.tandembike`. The database path comes from a resolver: `TANDEMBIKE_DATA_DIR` when set, else `data` in the checkout, so `npm run dev`, `npm start` and worktree servers are unchanged. Migrations are found from the package folder, not the working directory.

On first run, when `~/.tandembike/ticket.db` is missing and `data/ticket.db` exists, the command copies it with any `-wal` and `-shm` files and says so. It never moves, deletes or overwrites a database, so the User can go back.

The first-run offer to register the MCP server at user scope in Claude Code runs `claude mcp add` only after the User says yes. That consent follows ADR 0020: Tandembike advises, the User decides. The offers made are remembered in `~/.tandembike/config.json`.

## Considered Options

- Publish to npm: reaches more people, but Tandembike is local and changes quickly; a checkout needs no release process.
- Keep the data in the checkout: simplest, but one install could not serve other repositories, and a fresh clone lost the data.
- Move the existing database: a failed or unwanted switch would lose Tickets.

## Consequences

- Two databases can exist (the checkout's and `~/.tandembike`); only the installed command uses the latter.
- Every doc that places the database in `data/` also names `~/.tandembike` for the installed command.
