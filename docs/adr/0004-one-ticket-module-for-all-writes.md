# One Tickets module is the only way to read or change Tickets

The UI (via Server Actions) and the MCP tools both call a single Tickets module, which validates input, writes through Drizzle to SQLite, and announces each change for live updates. Nothing else touches the database. This guarantees a change by an Agent and a change by the User behave identically, and gives one seam to test instead of two.
