# Browser checks

jsdom cannot run Next's routing, so a bug in navigation, a drawer or dialog, or a Server Action that navigates can pass every test and both reviews (the 404 after a delete in T60 did). Nor can it reproduce a click whose handler unmounts its own target, such as an outside click closing an overlay: a real browser commits React's update between event listeners, jsdom does not, so such a test stays green on the bug (T358). Check such a change in a real browser: headless Chrome driving a throwaway copy of the branch.

## Never the User's app or data

Run every check against a throwaway server with its own database, never the User's running app on `localhost:4747` or its `data/` folder: a check creates and deletes Tickets. Keep each check's script in your scratchpad, not the repo: `AGENTS.md` allows one test runner, Vitest. Only the shared helpers in `browser-check/lib.mjs` live here.

## Recipe

1. **Commit** the change you want to check; the worktree takes it from `HEAD`.
2. **Worktree.** `git worktree add --detach <scratchpad>/wt HEAD`. Next locks `.next/dev` per folder, so a second server needs its own folder, and the app keeps its database under the folder (`data/`), so the worktree starts with an empty one.
3. **Install.** In the worktree: `npm ci --prefer-offline --no-audit --no-fund --ignore-scripts`, then `npm rebuild better-sqlite3` (a few seconds). Do not symlink `node_modules`: Turbopack will not resolve packages outside the folder. Unlike a run's worktree in "Worktrees for parallel runs" (`issue-tracker.md`), this one always needs the install: it is served, and it sits outside the repository.
4. **Serve.** Run `npm run dev -- -p 3100` from the worktree in the background (with `TANDEMBIKE_FAKE_RUNS=1` in front when the check needs a Conversation, see "Conversations in a given state" below), and wait until `curl` gets a 200 from `http://localhost:3100/`.
5. **Driver.** Set up a separate scratchpad folder with absolute paths and no `cd`, so it works from a session locked to its worktree: `npm --prefix <scratchpad>/driver i playwright-core` (it creates the folder's `package.json`; do not run `npm init`, which ignores `--prefix` and rewrites the current folder's `package.json`), then `cp docs/agents/browser-check/lib.mjs <scratchpad>/driver/`. Put each check script in that folder and run it with `node <scratchpad>/driver/<script>.mjs`, so `playwright-core` resolves from there. The helper [`browser-check/lib.mjs`](browser-check/lib.mjs) launches the installed Chrome headless (`launch`), calls MCP tools (`call`), gives a Project a repository path for fake runs (`fakeRepository`), replies in the open Conversation (`reply`), opens and finds a Ticket drawer (`openDrawer`, `drawerOf`), lists a drawer's button names (`buttonNames`) and activates a control by mouse, Enter or Space (`press`).
6. **Seed** through MCP on the throwaway port with `call`, never the database. Start each run with `freshProject(page)`, which creates the Project through the UI, since MCP has no tool for it, so runs repeat. Read each tool's input and reply shape from its `registerTool` call in `src/mcp/*-tools.ts` rather than guessing: `file_tickets` returns `{ numbers }` and creates an Epic with `type: "Epic"` and its children with `epicPosition`.
7. **Drive and assert** the user's exact symptom: the URL (`pathname + search`), what a heading or `getByText(/not found/i)` shows, `window.scrollY`, `document.title`. A check passes only if it can fail: make it go red once, on the bug or by breaking the code in the worktree, then restore.
8. **Clean up.** Stop the server, then `git worktree remove --force <scratchpad>/wt` and `git worktree prune`.

## Conversations in a given state

A check that needs a running Conversation, or one waiting for the User, uses fake runs: still through the app's own paths, never the database. Start the server with `TANDEMBIKE_FAKE_RUNS=1 npm run dev -- -p 3100`. Every run then starts no Agent and runs no git; a Start gets a worktree path that is never made. The server refuses to start with it on port 4747, the User's app.

1. Give the fresh Project a repository path with `fakeRepository(page, id)`: a Start needs one, and with fake runs nothing runs in it.
2. Start the Conversation as the User does, such as the drawer's **Start**, **Ask** or a Board's **Plan**. It says it got the first message and stays running (the tab's "Agent running" marker).
3. Move it with a reply holding a directive, `reply(page, 'fake:permission')`, or put the directive in an Ask's first message. A reply without one keeps it running.
   - `fake:permission`: a permission request, so it waits for the User ("Needs you" on the tab, the Board and the header). Answering it runs it again.
   - `fake:widget`: choice cards, waiting the same way.
   - `fake:idle`: the turn ends; it listens for a reply.
   - `fake:exit`: the turn and the run's process end; a later reply resumes it.

Fake runs count against the machine cap of runs (3 by default) like real ones, so end each with `reply(page, 'fake:exit')` or **Stop** before the script ends; otherwise later Starts are refused until you restart the server. The fake run calls no MCP tools, so the Ticket keeps its Status and Claim: set those through `call` when the check needs them. See `src/conversations/scripted-runner.ts`.

## Gotchas

- **Wait by time, not `networkidle`.** The live-updates stream (`/api/events`) keeps the network busy, so `waitForLoadState('networkidle')` never settles. Wait for a URL or element, then `waitForTimeout` about a second.
- **Titles carry a suffix.** The root layout appends ` | Tandembike` to every page title.
- **Locators are strict.** `getByLabel` and `getByText` match any substring, ignoring case, so pass `{ exact: true }`, and scope a drawer's controls to it, since the Board behind it has labels too: `page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /^Copy Ticket number/ }) }).getByLabel('Status', { exact: true })`. Two matches of the same drawer can appear for a moment mid-navigation; re-check after settling before calling it a bug.
- **Restart after patching `node_modules`.** Source edits in the worktree hot-reload; a patched package (to make a check go red) needs the server stopped, `.next` removed and the server started again.
- **Compare with `main`.** When a result surprises you, run the same script against a second worktree of `main` on another port, to tell a regression from existing behaviour.
