import { appDataFolder } from '../db/connection';
import { appDatabase, appTickets } from '../tickets/app-tickets';
import { appChangeChannel } from '../tickets/changes';
import { createWorktrees } from '../worktrees/worktrees';
import { createClaudeRunner } from './claude-runner';
import { type Conversations, createConversations } from './conversations';
import { agentBackends } from './fake-runs';
import { terminalSweepMs } from './terminal-shared';

const globalKey = Symbol.for('ticket.conversations');
type GlobalWithConversations = typeof globalThis & {
  [globalKey]?: Conversations;
};

/**
 * Where runs reach Tandembike's MCP server. The app serves it on 4747. Set
 * `TANDEMBIKE_MCP_URL` when the app runs on another port, such as a
 * throwaway `next dev -p 3100` server in a worktree, so its runs reach that
 * server's own database (see docs/agents/issue-tracker.md).
 */
const mcpUrl =
  process.env.TANDEMBIKE_MCP_URL ?? 'http://localhost:4747/api/mcp';

/**
 * The Conversations module the app uses, with the Claude Code runner, or
 * the scripted one with `TANDEMBIKE_FAKE_RUNS=1`. It
 * lives on `globalThis`, with the runs it holds, so Server Actions share it
 * and dev-mode reloads keep it. The first call marks the Conversations of
 * runs that died with the previous server as interrupted. Only Server
 * Actions and the CLI's terminal route (ADR 0039) call it: no MCP tool may.
 */
export function appConversations(): Conversations {
  const global = globalThis as GlobalWithConversations;
  if (!global[globalKey]) {
    const conversations = createConversations({
      db: appDatabase(),
      tickets: appTickets('user'),
      changes: appChangeChannel(),
      // Fake runs on a throwaway server for browser checks (T678).
      ...agentBackends(process.env, () => ({
        runner: createClaudeRunner(),
        worktrees: createWorktrees({ owner: appDataFolder }),
      })),
      mcpUrl,
    });
    conversations.interruptStale();
    void conversations.cleanupWorktrees().catch(() => undefined);
    // End Terminal Conversations whose CLI went quiet (ADR 0039).
    setInterval(() => {
      try {
        conversations.endIdleTerminals();
      } catch {
        // The next sweep tries again.
      }
    }, terminalSweepMs).unref();
    global[globalKey] = conversations;
  }
  return global[globalKey];
}
