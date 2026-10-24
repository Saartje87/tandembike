# Live updates use Server-Sent Events, not WebSockets

Open browser tabs learn about changes through a Server-Sent Events route (`/api/events`) that streams "this changed" notices; the tab then refetches. Next.js route handlers cannot hold a WebSocket open (they need a custom server), whereas SSE is a documented streaming use of a plain route handler. Changes only ever flow server to browser, since edits go through Server Actions, so a two-way channel would buy nothing.
