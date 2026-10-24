# Agents connect through an MCP server hosted inside the Next.js app

Agents create and change Tickets through MCP tools served by a route in the Next.js app, not a separate MCP process and not direct SQLite access. Keeping every write in the one server process lets it push changes to open browsers the moment they happen; a separate writer would force the UI to poll or watch the database file.

## Considered Options

- Separate stdio MCP server writing to SQLite: simpler to register with agents, but the UI cannot see its writes without polling.
- REST API for agents: workable, but agents would need hand-written instructions instead of self-describing tools. May be added later beside MCP.
- Agents writing SQLite directly: no validation and no change notifications.
