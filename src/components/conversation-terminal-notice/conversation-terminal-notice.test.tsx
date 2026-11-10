// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { closeConversation } from '../../app/conversations/actions';
import type { Conversation } from '../../conversations/conversations';
import { aConversation } from '../../test/fixtures';
import { renderWithTheme } from '../../test/render';
import { ConversationTerminalNotice } from './conversation-terminal-notice';

vi.mock('../../app/conversations/actions', () => ({
  closeConversation: vi.fn(),
}));

const at = new Date('2026-03-01T09:00:00Z');

const conversation = (values: Partial<Conversation>): Conversation =>
  aConversation({
    id: 7,
    ticketNumber: 4,
    state: 'running',
    startedBy: 'terminal',
    createdAt: at,
    updatedAt: at,
    ...values,
  });

describe('ConversationTerminalNotice', () => {
  beforeEach(() => {
    vi.mocked(closeConversation).mockReset();
  });

  it('says the session runs in a terminal, without a Close button', () => {
    renderWithTheme(
      <ConversationTerminalNotice conversation={conversation({})} />,
    );

    expect(screen.getByText('Running in a terminal')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
  });

  it('closes the Conversation once the session ended', async () => {
    vi.mocked(closeConversation).mockResolvedValue({
      ok: true,
      conversation: conversation({ state: 'stopped', hidden: true }),
    });
    renderWithTheme(
      <ConversationTerminalNotice
        conversation={conversation({ state: 'stopped' })}
      />,
    );

    expect(screen.getByText('The terminal session ended.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(closeConversation).toHaveBeenCalledWith({ conversationId: 7 });
    });
  });

  it('shows why a refused Close failed', async () => {
    vi.mocked(closeConversation).mockResolvedValue({
      ok: false,
      error: 'The Conversation is already closed.',
    });
    renderWithTheme(
      <ConversationTerminalNotice
        conversation={conversation({ state: 'stopped' })}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(
      await screen.findByText('The Conversation is already closed.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
    });
  });

  it('shows a Close that throws as a refusal (T1324)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    vi.mocked(closeConversation).mockRejectedValue(new Error('network down'));
    renderWithTheme(
      <ConversationTerminalNotice
        conversation={conversation({ state: 'stopped' })}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(
      await screen.findByText(
        'The Conversation could not be closed. Try again.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Close' })).toBeEnabled();
    });
  });
});
