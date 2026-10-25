# Tickets are archived, never deleted

Removing a Ticket archives it: it leaves the normal views but can be restored. Agents can remove Tickets, and a wrong removal by an agent must be cheap to undo, so the MCP tools have no hard delete. Comments are the exception (ADR 0006), and the User can still delete a Ticket from the UI (ADR 0012).
