# Local-only is enforced by the server, not left to how it is started

ADR 0001 makes the app safe without authentication only while it is reachable from this machine alone, and ADR 0019 raises the stakes: the server starts Agent runs with shell access. Until now that rested on the npm scripts passing `-H localhost` to the `next` CLI, which any other way of starting it dropped, and on a Host check that someone on the network defeats by sending `Host: localhost` themselves. Nothing stopped another website open in the User's browser from calling `/api/mcp`, `/api/events` or the attachment routes, and the MCP spec requires servers to validate `Origin`. So the app enforces local-only itself, in four layers:

1. **Listen address.** `npm run dev` and `npm run start` run a custom server (`server.ts`, through Next's `next()` API) instead of the `next` CLI. It always listens on `127.0.0.1` and `::1`, and accepts only `-p`/`--port`; there is no hostname option to get wrong. On a machine without IPv6 it listens on `127.0.0.1` alone.
2. **Socket check.** The server refuses any connection whose remote address is not loopback (`127.0.0.0/8`, `::1`, `::ffff:127.x`) with a 403, "Tandembike only accepts connections from this machine", and logs it. With layer 1 this should never fire; it keeps a future listen change from silently exposing the app.
3. **Host check.** The proxy (`src/proxy.ts`) refuses a request whose Host is not `localhost`, `127.0.0.1` or `[::1]`, against DNS rebinding.
4. **Origin check.** The proxy refuses a request whose `Origin` is not exactly `http://<its Host>`, including `Origin: null`. A request without `Origin` passes, since CLI MCP clients send none and browsers send none on same-origin GETs.

## Considered Options

- Keep the `next` CLI and fail at startup when the hostname is not loopback: the CLI cannot be wrapped that way, and its default listens on every interface.
- Check `Origin` only on `/api/mcp`: other routes would each need remembering, and Server Actions already get Next's check, so one rule in the proxy for every route is simpler.
- A network mode behind a flag: out of scope until there is a concrete need.

## Consequences

- Running `next dev` or `next start` directly bypasses layers 1 and 2; the npm scripts are the supported way to start the app.
- A future network mode needs its own ADR, and must add authentication first (ADR 0001), then replace layers 1 and 2 and relax the Host and Origin checks for the names it serves.
