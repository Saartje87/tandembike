import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { closeConversation } from '../../app/conversations/actions';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import { ConversationDrawer } from './conversation-drawer';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../../app/conversations/actions', () => ({
  answerConversationPermission: vi.fn(),
  closeConversation: vi.fn(),
  replyToConversation: vi.fn(),
  stopConversation: vi.fn(),
}));

const at = new Date('2026-03-01T09:00:00Z');

const item = {
  conversation: {
    id: 9,
    projectId: 3,
    ticketNumber: null,
    intent: 'new_ticket' as const,
    state: 'idle' as const,
    sdkSessionId: null,
    costUsd: 0,
    hidden: false,
    defaultCycleId: null,
    defaultEpicNumber: null,
    defaultType: null,
    createdAt: at,
    updatedAt: at,
  },
  transcript: [
    {
      id: 1,
      conversationId: 9,
      role: 'user' as const,
      text: 'Add coupons',
      permission: null,
      createdAt: at,
    },
    {
      id: 2,
      conversationId: 9,
      role: 'agent' as const,
      text: 'I created T41 and T42.',
      permission: null,
      createdAt: at,
    },
  ],
};

describe('ConversationDrawer', () => {
  beforeEach(() => {
    vi.mocked(closeConversation).mockReset();
  });

  it('shows the transcript with the same reply field and Stop as a Ticket Conversation', () => {
    vi.mocked(useRouter).mockReturnValue(mockRouter());
    renderWithTheme(<ConversationDrawer item={item} boardPath="/project/3" />);

    const drawer = screen.getByRole('dialog', { name: 'New Ticket' });
    expect(drawer).toHaveTextContent('Add coupons');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Reply' })).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: 'Conversations' }),
    ).not.toBeInTheDocument();
  });

  it('links the Tickets the transcript names', () => {
    vi.mocked(useRouter).mockReturnValue(mockRouter());
    renderWithTheme(<ConversationDrawer item={item} boardPath="/project/3" />);

    expect(screen.getByRole('link', { name: 'T41' })).toHaveAttribute(
      'href',
      '/ticket/41',
    );
    expect(screen.getByRole('link', { name: 'T42' })).toHaveAttribute(
      'href',
      '/ticket/42',
    );
  });

  it('links back to the Epic whose drawer it replaced', () => {
    vi.mocked(useRouter).mockReturnValue(mockRouter());
    renderWithTheme(
      <ConversationDrawer
        item={item}
        boardPath="/project/3"
        backTo={{ number: 8, href: '/project/3?ticket=8' }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Back to T8' })).toHaveAttribute(
      'href',
      '/project/3?ticket=8',
    );
  });

  it('only hides on the X, leaving the run going', async () => {
    const router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
    renderWithTheme(<ConversationDrawer item={item} boardPath="/project/3" />);

    await userEvent.click(screen.getByRole('button', { name: 'Hide' }));

    expect(router.replace).toHaveBeenCalledWith('/project/3', {
      scroll: false,
    });
    expect(closeConversation).not.toHaveBeenCalled();
  });

  it('closes the Conversation, stopping it, with Close Conversation', async () => {
    const router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
    vi.mocked(closeConversation).mockResolvedValue({
      ok: true,
      conversation: item.conversation,
    });
    renderWithTheme(<ConversationDrawer item={item} boardPath="/project/3" />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Close Conversation' }),
    );

    expect(closeConversation).toHaveBeenCalledExactlyOnceWith({
      conversationId: 9,
    });
    expect(router.replace).toHaveBeenCalledWith('/project/3', {
      scroll: false,
    });
  });

  it('shows why a close was refused and stays open', async () => {
    const router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
    vi.mocked(closeConversation).mockResolvedValue({
      ok: false,
      error: 'No such Conversation.',
    });
    renderWithTheme(<ConversationDrawer item={item} boardPath="/project/3" />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Close Conversation' }),
    );

    expect(
      await screen.findByText('No such Conversation.'),
    ).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
