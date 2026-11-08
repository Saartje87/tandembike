# Does an MCP caller send its folder to Tandembike? (T1199)

Spike for Epic T1192. Date: 2026-11-08. Claude Code 2.1.319, Agent SDK 0.3.316.

## Method

- A throwaway Node HTTP server on port 4799 answered `initialize` and `tools/list` and logged each request's method, JSON-RPC method and `X-Tandembike-Cwd` header. Port 4747 and its data were not touched.
- Registered it at user scope as `tandembike-spike`:
  `claude mcp add --scope user --transport http tandembike-spike http://localhost:4799/mcp --header 'X-Tandembike-Cwd: ${PWD}'`
  (single quotes, so the shell leaves `${PWD}` for Claude Code).
- Ran `claude -p "say ok"` from two folders, `/tmp/spike-a` and `/tmp/spike-b`.
- Ran a Claude Agent SDK `query()` with `mcpServers: { spike2: { type: 'http', url, headers: {...} } }` and `options.cwd` set to `/tmp/spike-a`, from a process whose own cwd was `/tmp/spike-srv`. One header held a literal path, another held `${PWD}`.
- Removed the registration with `claude mcp remove --scope user tandembike-spike`, stopped the server and deleted the temp folders.

## Observations

### `~/.claude.json`

Stored under top-level `mcpServers`, unexpanded:

```json
"tandembike-spike": {
  "type": "http",
  "url": "http://localhost:4799/mcp",
  "headers": { "X-Tandembike-Cwd": "${PWD}" }
}
```

### Claude Code terminal sessions

`${PWD}` is expanded at session start, to the folder the session started in. Every request carried it: `server/discover`, `initialize`, `notifications/initialized`, the `GET` for the stream and `tools/list`.

| Started in | `X-Tandembike-Cwd` received |
| --- | --- |
| `/tmp/spike-a` | `/tmp/spike-a` (all 5 requests) |
| `/tmp/spike-b` | `/tmp/spike-b` (all 5 requests) |

### Agent SDK

- Custom `headers` in an HTTP `mcpServers` entry are sent on every request (5 of 5; the literal path arrived as `/tmp/spike-a`).
- `${VAR}` is expanded here too, but against the SDK process's environment, not `options.cwd`: `X-Other: ${PWD}` arrived as `/tmp/spike-srv`, the process's cwd. So a run must pass the literal working directory, as the Epic plans; never `${PWD}`.

## Verdict

Use the header. No `repositoryPath` argument is needed.

- Terminal sessions: the user-scope registration below sends the session's folder.
- Tandembike's own runs (`src/conversations/claude-runner.ts`, `mcpServers: { tandembike: { type: 'http', url: mcpUrl } }`): add `headers: { 'X-Tandembike-Cwd': <run cwd> }` with the literal path.
- The header is the folder where the session started, not necessarily the repository root; Tandembike walks up to the nearest `.git` (T1203).
- The registration is global: a session in any folder sends its folder, including ones no Project contains.

Exact registration command:

```sh
claude mcp add --scope user --transport http tandembike http://localhost:4747/api/mcp --header 'X-Tandembike-Cwd: ${PWD}'
```

Keep the single quotes. A User who already has a `tandembike` registration must remove it first (`claude mcp remove --scope user tandembike`); T1204 should handle that.
