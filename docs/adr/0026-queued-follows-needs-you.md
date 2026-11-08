# Queued follows Needs you

Reverted (T1148): ADR 0024's section order stands again, Needs you, In flight, Your work, Queued and Done, with Queued starting closed on the Active Cycle's Board. In flight is what is happening right now. Seeing it right after Needs you matters more than seeing what runs next, and a long Queued list pushed In flight down the page.

ADR 0024 ordered the Board's sections Needs you, In flight, Your work, Queued and Done, with Queued starting closed on the Active Cycle's Board. Every Board (the Active Cycle's, each Prepared Cycle's and the Backlog's) now shows them as Needs you, Queued, In flight, Your work and Done, with the Archived Tickets still at the bottom, and Queued starts open on every Board.

Queued is the Autopilot's priority order, what runs next. Right after Needs you it shows what will start once the User has answered, before what is already running.

Your work keeps its open state: closed on the Active Cycle's Board, open on a planning Board. Done and Archived start closed, and a planning Board still hides its empty sections. This replaces the section order of ADR 0024; the rest of it stands.
