import { createSpars } from '../spars/spars';
import { createChangeChannel } from '../tickets/changes';
import { createTestConversations } from './conversations';

/**
 * Spars over Tickets and Conversations with the fake runner, on a fresh
 * in-memory database with the real migrations, and a Project with a
 * repository path. `changes` records every change published. Test files
 * that use it need `// @vitest-environment node` on line 1.
 */
export function createTestSpars() {
  const channel = createChangeChannel();
  const published: unknown[] = [];
  channel.subscribe((change) => published.push(change));
  const world = createTestConversations(channel);
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
  });
  const spars = createSpars({
    db: world.db,
    tickets: world.tickets,
    conversations: world.conversations,
    changes: channel,
  });
  return { ...world, spars, project, published };
}
