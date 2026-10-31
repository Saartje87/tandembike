import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { appConversations } from '../../../../conversations/app-conversations';
import { createTestConversations } from '../../../../test/conversations';
import { renderWithTheme } from '../../../../test/render';
import { BoardConversationDrawer } from './board-conversation-drawer';

vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../../conversations/app-conversations', () => ({
  appConversations: vi.fn(),
}));
vi.mock(
  '../../../../components/conversation-drawer/conversation-drawer',
  () => ({
    ConversationDrawer: ({
      item,
      boardPath,
      backTo,
    }: {
      item: { conversation: { id: number }; transcript: { text: string }[] };
      boardPath: string;
      backTo?: { number: number; href: string };
    }) => (
      <div
        role="dialog"
        data-board-path={boardPath}
        data-back={backTo ? `${backTo.number} ${backTo.href}` : ''}
      >
        {`Conversation ${item.conversation.id}: ${item.transcript.map(({ text }) => text).join(',')}`}
      </div>
    ),
  }),
);

async function setUp() {
  const world = createTestConversations();
  const project = world.tickets.createProject({ name: 'Website' });
  world.tickets.setProjectAgentSettings(project.id, {
    repositoryPath: world.repositoryDir,
  });
  const conversation = await world.conversations.start({
    projectId: project.id,
    intent: 'new_ticket',
    prompt: 'Add coupons',
  });
  vi.mocked(appConversations).mockReturnValue(world.conversations);
  return { ...world, project, conversation };
}

describe('BoardConversationDrawer', () => {
  it("renders a Project Conversation's drawer with its transcript", async () => {
    const { project, conversation } = await setUp();

    renderWithTheme(
      <div>
        {
          await BoardConversationDrawer({
            projectId: project.id,
            id: conversation.id,
            boardPath: '/project/1',
          })
        }
      </div>,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent(
      `Conversation ${conversation.id}: Add coupons`,
    );
  });

  it('links back to the Epic it came from, over the same Board', async () => {
    const { project, conversation } = await setUp();

    renderWithTheme(
      <div>
        {
          await BoardConversationDrawer({
            projectId: project.id,
            id: conversation.id,
            boardPath: '/project/1',
            fromTicket: 8,
          })
        }
      </div>,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-back',
      '8 /project/1?ticket=8',
    );
  });

  it('keeps the Board filter when closing or going back', async () => {
    const { project, conversation } = await setUp();

    renderWithTheme(
      <div>
        {
          await BoardConversationDrawer({
            projectId: project.id,
            id: conversation.id,
            boardPath: '/project/1',
            filter: { query: 'a', labels: [] },
            fromTicket: 8,
          })
        }
      </div>,
    );

    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-board-path',
      '/project/1?q=a',
    );
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-back',
      '8 /project/1?q=a&ticket=8',
    );
  });

  it("shows nothing for another Project's Conversation or one that does not exist", async () => {
    const { project, conversation } = await setUp();

    const elsewhere = await BoardConversationDrawer({
      projectId: project.id + 1,
      id: conversation.id,
      boardPath: '/project/2',
    });
    const missing = await BoardConversationDrawer({
      projectId: project.id,
      id: 999,
      boardPath: '/project/1',
    });

    expect(elsewhere).toBeNull();
    expect(missing).toBeNull();
  });
});
