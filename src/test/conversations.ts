import { createConversations } from '../conversations/conversations';
import { openDatabase } from '../db/connection';
import type { ChangeChannel } from '../tickets/changes';
import { createTickets } from '../tickets/tickets';
import { createFakeRunner } from './fake-runner';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Conversations over a fresh in-memory database with the real migrations and
 * a fake runner, next to the Tickets module they share it with.
 * `repositoryDir` is an existing directory to use as a Project's repository
 * path. `restart()` is a new Conversations module over the same database with
 * no live runs, like the server after a restart. Test files that use it need
 * `// @vitest-environment node` on line 1.
 */
export function createTestConversations(changes?: ChangeChannel) {
  const db = openDatabase(':memory:');
  const tickets = createTickets(db, 'user', changes);
  const runner = createFakeRunner();
  const create = () =>
    createConversations({
      db,
      tickets,
      changes,
      runner,
      mcpUrl: 'http://localhost:4747/api/mcp',
    });
  const repositoryDir = mkdtempSync(join(tmpdir(), 'tandembike-repo-'));
  return {
    conversations: create(),
    restart: create,
    tickets,
    runner,
    repositoryDir,
  };
}
