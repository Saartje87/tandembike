# The CLI runs the server in the background

Decided on 2026-11-10 with the User (Epic T1349). Amends [ADR 0035](0035-tandembike-installs-from-its-checkout.md), where bare `tandembike` served the app in the foreground, and renames the session command of [ADR 0039](0039-terminal-conversations.md).

Bare `tandembike` ran the production server in the foreground, so the User kept a terminal tab open for it, could not stop it from elsewhere and could not ask whether it ran or where its output went. `tandembike start T42` did not start Tandembike but a session on a Ticket, and every session command failed with "not running" when the server was down.

## Decision

- **`start` and `stop` control the server.** `tandembike start [-p <port>]` runs the first-run steps (the database copy, the MCP and plugin offers, ADR 0035) while it still has the terminal, then spawns the production server detached, as the leader of its own process group, with its output appended to `~/.tandembike/server.log`. It records `{ pid, port, startedAt }` in `~/.tandembike/server.json` and returns once the server answers, printing the URL and the log path; a server that never answers is reported with the log path and exit 1. It refuses with "run `npm run build` first" when the checkout has no build, and says "already running at …" (exit 0) when a server answers. `--foreground` runs the same steps and serves in the terminal, writing no `server.json`.
- **`stop` stops only what `start` started.** It sends SIGTERM to the recorded process group, waits for it to exit, escalates to SIGKILL after 10 seconds (saying so) and removes `server.json`. A server that answers but is not in `server.json`, such as `npm run dev`, is refused. Before stopping it asks the server for its open Terminal Conversations and, when there are some, names their Tickets and asks `Stop anyway? [y/N]`; `--force` skips the question, and without a terminal it refuses and mentions `--force`.
- **`restart`, `status` and `logs`.** `restart` is `stop` then `start` on the recorded port. `status` prints pid, URL, uptime and log path, exits 1 when nothing runs, and reports a server it did not start as running, not started by `tandembike start`. `logs` prints the log's last 100 lines; `logs -f` follows it.
- **`server.json` is checked, not trusted.** A recorded pid that is no longer alive is removed and treated as not running, so a crash or a reboot does not confuse `start`, `stop` or `status`.
- **Clients find the server** from `TANDEMBIKE_URL`, else the port in `server.json`, else 4747.
- **The log rolls over on start.** Past 5 MB it is renamed to `server.log.1`, replacing an earlier one; then a "started at <ISO time>" line is appended.
- **Session commands start the server themselves.** `implement`, `triage`, `spec`, `plan`, `resume` and the wizard, finding no server, run the start steps without the MCP and plugin offers, print one line ("Started Tandembike on :<port> (logs: <path>)") and carry on. A failed start prints why, the log path and the `tandembike start` hint, and exits 1.
- **Bare `tandembike` is a wizard.** In a terminal it asks for a Project when the folder is in none, then an action (Implement, Triage, Spec, Plan, Resume, or Server, labelled with the server's state), then the argument: a list of the Tickets or Conversations that fit, ending with "type a number…", or a goal for Plan. It returns the same parsed command the typed command parses to and runs it through the same path, so the two cannot drift. Ctrl+C at a prompt exits 130. Without a terminal, and for `help` and `--help`, it prints the help.
- **The folder is the User's.** `bin/tandembike.mjs` runs the CLI from the checkout, so it passes the folder the command was typed in as `TANDEMBIKE_CWD`; the wizard's Project step, `implement` without a Ticket and `plan` resolve the Project from it.
- **Decisions in modules, I/O in the entry.** The lifecycle (`src/install/server-lifecycle.ts`) and the wizard (`src/install/wizard.ts`) decide over injected effects and a prompter, tested in-process with fakes; `src/install/cli.ts` only wires the real ones. Tests never boot the real server.

## Considered Options

- A launchd agent that starts the server at login and restarts it after a crash: more moving parts and macOS only; out of scope.
- Keep bare `tandembike` serving and add `stop`: the foreground server has no pid file to stop it by.
- Alias `start <ticket>` and `next` to the new commands: two spellings of one thing; the User chose none.

## Consequences

- The server keeps running after its terminal closes; `stop` is the way to end it.
- Output that used to scroll in the terminal is in `server.log`.
- `tandembike start` no longer opens a session: an Agent or doc that names it for a session is out of date (`tandembike implement` replaces it).
- A pid reused by another process after a reboot, while `server.json` survived, reads as alive; `stop` would signal it. Rare, and accepted.
