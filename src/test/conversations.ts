import { createConversations } from '../conversations/conversations';
import { openDatabase } from '../db/connection';
import { type AgentKind, agentKinds } from '../tickets/agent-kind';
import type { ChangeChannel } from '../tickets/changes';
import { createTickets } from '../tickets/tickets';
import { createFakeRunner, type FakeRunners } from './fake-runner';
import { createFakeWorktrees } from './fake-worktrees';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Conversations over a fresh in-memory database with the real migrations and
 * a fake runner per Agent kind (`kinds` registers fewer), next to the Tickets
 * module they share it with. `runner` is Claude Code's, every Project's
 * default.
 * `repositoryDir` is an existing directory to use as a Project's repository
 * path. `restart()` is a new Conversations module over the same database with
 * no live runs, like the server after a restart.
 */
export function createTestConversations(
  changes?: ChangeChannel,
  { kinds = agentKinds }: { kinds?: readonly AgentKind[] } = {},
) {
  const db = openDatabase(':memory:');
  const tickets = createTickets(db, 'user', changes);
  const runners = Object.fromEntries(
    agentKinds.map((kind) => [kind, createFakeRunner(kind)]),
  ) as FakeRunners;
  const runner = runners['claude-code'];
  const worktrees = createFakeWorktrees();
  const create = () =>
    createConversations({
      db,
      tickets,
      changes,
      runners: Object.fromEntries(kinds.map((kind) => [kind, runners[kind]])),
      worktrees,
      mcpUrl: 'http://localhost:4747/api/mcp',
    });
  const repositoryDir = mkdtempSync(join(tmpdir(), 'tandembike-repo-'));
  return {
    conversations: create(),
    restart: create,
    db,
    tickets,
    runner,
    runners,
    worktrees,
    repositoryDir,
  };
}
