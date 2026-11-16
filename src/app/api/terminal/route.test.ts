import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appConversations } from '../../../conversations/app-conversations';
import { createTestConversations } from '../../../test/conversations';
import { appTickets } from '../../../tickets/app-tickets';
import { POST } from './route';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../../conversations/app-conversations', () => ({
  appConversations: vi.fn(),
}));
vi.mock('../../../tickets/app-tickets', () => ({ appTickets: vi.fn() }));

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

describe('POST /api/terminal setup (T1561)', () => {
  beforeEach(() => {
    vi.mocked(appConversations).mockReset();
  });

  it("starts a Terminal Setup of the folder's Project", async () => {
    const { conversations, repositoryDir } = setup();

    const response = await post({ action: 'setup', folder: repositoryDir });

    expect(response.status).toBe(200);
    const session = await response.json();
    expect(conversations.get(session.conversationId)).toMatchObject({
      intent: 'setup',
      startedBy: 'terminal',
    });
  });

  it('refuses a folder in no Project with a message naming tandembike add', async () => {
    setup();

    const response = await post({ action: 'setup', folder: '/nowhere' });

    expect(response.status).toBe(409);
    expect(await response.text()).toContain('tandembike add');
  });

  it('refuses a second Setup while one runs', async () => {
    const { repositoryDir } = setup();
    await post({ action: 'setup', folder: repositoryDir });

    const response = await post({ action: 'setup', folder: repositoryDir });

    expect(response.status).toBe(409);
    expect(await response.text()).toContain('already has a Setup running');
  });
});

describe('POST /api/terminal add (T1562)', () => {
  const gitFolder = () => {
    const path = realpathSync(mkdtempSync(join(tmpdir(), 'add-')));
    mkdirSync(join(path, '.git'));
    writeFileSync(join(path, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    return path;
  };

  beforeEach(() => {
    vi.mocked(appTickets).mockReset();
  });

  it('creates the Project of the folder as the User, and reports it the second time', async () => {
    const { tickets } = setup();
    vi.mocked(appTickets).mockReturnValue(tickets);
    const path = gitFolder();
    mkdirSync(join(path, 'sub'));

    const first = await post({ action: 'add', folder: join(path, 'sub') });
    const again = await post({ action: 'add', folder: path });

    expect(appTickets).toHaveBeenCalledWith('user');
    const created = await first.json();
    expect(created).toMatchObject({
      created: true,
      repositoryPath: path,
      project: { name: path.split('/').pop() },
    });
    expect(await again.json()).toMatchObject({
      created: false,
      project: { id: created.project.id },
    });
  });

  it("refuses a folder that is not a git repository with the module's message", async () => {
    const { tickets } = setup();
    vi.mocked(appTickets).mockReturnValue(tickets);
    const plain = realpathSync(mkdtempSync(join(tmpdir(), 'plain-')));

    const response = await post({ action: 'add', folder: plain });

    expect(response.status).toBe(409);
    expect(await response.text()).toBe(
      'This folder is not a git repository: it has no .git inside.',
    );
  });
});
