# Browser checks

jsdom cannot run Next's routing, so a bug in navigation, a drawer or dialog, or a Server Action that navigates can pass every test and both reviews (the 404 after a delete in T60 did). Check such a change in a real browser: headless Chrome driving a throwaway copy of the branch.

## Never the User's app or data

Run every check against a throwaway server with its own database, never the User's running app on `localhost:4747` or its `data/` folder: a check creates and deletes Tickets. Keep the scripts in your scratchpad, not the repo: `AGENTS.md` allows one test runner, Vitest.

## Recipe

1. **Commit** the change you want to check; the worktree takes it from `HEAD`.
2. **Worktree.** `git worktree add --detach <scratchpad>/wt HEAD`. Next locks `.next/dev` per folder, so a second server needs its own folder, and the app keeps its database under the folder (`data/`), so the worktree starts with an empty one.
3. **Install.** In the worktree: `npm ci --prefer-offline --no-audit --no-fund --ignore-scripts`, then `npm rebuild better-sqlite3` (a few seconds). Do not symlink `node_modules`: Turbopack will not resolve packages outside the folder.
4. **Serve.** Run `npx next dev -H localhost -p 3100` from the worktree in the background, and wait until `curl` gets a 200 from `http://localhost:3100/`.
5. **Driver.** In a separate scratchpad folder: `npm init -y && npm i playwright-core`. Launch the installed Chrome:

   ```js
   import { chromium } from 'playwright-core';
   const browser = await chromium.launch({
     executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
     headless: true,
   });
   ```

6. **Seed** through MCP on the throwaway port, never the database. Create a fresh Project per run so runs repeat. This helper posts a JSON-RPC `tools/call`, reads the event-stream reply and throws on a refused call:

   ```js
   let rpcId = 0;
   async function call(name, args) {
     const res = await fetch('http://localhost:3100/api/mcp', {
       method: 'POST',
       headers: {
         'content-type': 'application/json',
         accept: 'application/json, text/event-stream',
       },
       body: JSON.stringify({
         jsonrpc: '2.0',
         id: ++rpcId,
         method: 'tools/call',
         params: { name, arguments: args },
       }),
     });
     const text = await res.text();
     const data = text.split('\n').find((line) => line.startsWith('data:'));
     const { result, error } = JSON.parse(data ? data.slice(5) : text);
     const body = result?.content?.[0]?.text ?? error?.message;
     if (error || result?.isError) throw new Error(`${name}: ${body}`);
     try { return JSON.parse(body); } catch { return body; }
   }
   ```

   Read each tool's input and reply shape from its `registerTool` call in `src/mcp/mcp-server.ts` rather than guessing: `create_tickets` returns `{ numbers }`.
7. **Drive and assert** the user's exact symptom: the URL (`pathname + search`), what a heading or `getByText(/not found/i)` shows, `window.scrollY`, `document.title`. A check passes only if it can fail: make it go red once, on the bug or by breaking the code in the worktree, then restore.
8. **Clean up.** Stop the server, then `git worktree remove --force <scratchpad>/wt` and `git worktree prune`.

## Gotchas

- **Wait by time, not `networkidle`.** The live-updates stream (`/api/events`) keeps the network busy, so `waitForLoadState('networkidle')` never settles. Wait for a URL or element, then `waitForTimeout` about a second.
- **Titles carry a suffix.** The root layout appends ` | Tandembike` to every page title.
- **Locators are strict.** `getByLabel` and `getByText` match any substring, ignoring case, so pass `{ exact: true }`, and scope a drawer's controls to it, since the Board behind it has labels too: `page.getByRole('dialog').filter({ has: page.getByRole('button', { name: /^Copy Ticket number/ }) }).getByLabel('Status', { exact: true })`. Two matches of the same drawer can appear for a moment mid-navigation; re-check after settling before calling it a bug.
- **Compare with `main`.** When a result surprises you, run the same script against a second worktree of `main` on another port, to tell a regression from existing behaviour.
