# Comments are deleted, not archived

Unlike Tickets (ADR 0003), removing a Comment deletes it permanently: a Comment is a short note, not a unit of work, so an archive with its own restore path would add weight for little gain. ADR 0003 keeps an Agent's mistake cheap to undo, and that still holds because an Agent can edit or remove only Comments written by an Agent, while the User can change any; the author is set by where a Comment was written (UI `user`, MCP `agent`), so an Agent cannot pass as the User.
