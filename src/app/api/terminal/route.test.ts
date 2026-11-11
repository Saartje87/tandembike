import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appConversations } from '../../../conversations/app-conversations';
import { createTestConversations } from '../../../test/conversations';
import { POST } from './route';

vi.mock('../../../conversations/app-conversations', () => ({
  appConversations: vi.fn(),
}));

function setup() {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
  });
  const ticket = world.tickets.createTicket({
    projectId: project.id,
    title: 'Fix it',
  });
  vi.mocked(appConversations).mockReturnValue(world.conversations);
  return { ...world, ticket };
}

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/terminal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

describe('POST /api/terminal start (T1342)', () => {
  beforeEach(() => {
    vi.mocked(appConversations).mockReset();
  });

  it('refuses an intent that is not a Terminal intent with a 400 naming the allowed ones, and leaves no Conversation', async () => {
    const { conversations, ticket } = setup();

    const response = await post({
      action: 'start',
      ticketNumber: ticket.number,
      intent: 'ask',
    });

    expect(response.status).toBe(400);
    const message = await response.text();
    expect(message).toContain('start');
    expect(message).toContain('triage');
    expect(message).toContain('spec');
    expect(conversations.list({ ticketNumber: ticket.number })).toEqual([]);
  });

  it.each([[42], [{ intent: 'start' }]])(
    'refuses a non-string intent %j with a 400',
    async (intent) => {
      const { conversations, ticket } = setup();

      const response = await post({
        action: 'start',
        ticketNumber: ticket.number,
        intent,
      });

      expect(response.status).toBe(400);
      expect(conversations.list({ ticketNumber: ticket.number })).toEqual([]);
    },
  );

  it('opens a Start Conversation when no intent is given', async () => {
    const { conversations, ticket } = setup();

    const response = await post({
      action: 'start',
      ticketNumber: ticket.number,
    });

    expect(response.status).toBe(200);
    const { conversationId } = await response.json();
    expect(conversations.get(conversationId)).toMatchObject({
      ticketNumber: ticket.number,
      intent: 'start',
      startedBy: 'terminal',
    });
  });

  it.each(['triage', 'spec'] as const)(
    'opens a %s Conversation',
    async (intent) => {
      const { conversations, ticket } = setup();

      const response = await post({
        action: 'start',
        ticketNumber: ticket.number,
        intent,
      });

      expect(response.status).toBe(200);
      const { conversationId } = await response.json();
      expect(conversations.get(conversationId)).toMatchObject({ intent });
    },
  );
});

describe('POST /api/terminal sessions (T1352)', () => {
  beforeEach(() => {
    vi.mocked(appConversations).mockReset();
  });

  it('answers with the open Terminal Conversations', async () => {
    const { conversations, ticket } = setup();
    const session = await conversations.startTerminal({
      ticketNumber: ticket.number,
      intent: 'start',
    });

    const response = await post({ action: 'sessions' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { conversationId: session.conversationId, ticketNumber: ticket.number },
    ]);
  });
});
