// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  loadAgentChoices,
  startConversation,
} from '../../app/conversations/actions';
import { aConversation, agentChoices } from '../../test/fixtures';
import { renderWithTheme } from '../../test/render';
import { ConversationDraft } from './conversation-draft';

vi.mock('../../app/conversations/actions', () => ({
  startConversation: vi.fn(),
  loadAgentChoices: vi.fn(),
}));

describe('ConversationDraft', () => {
  beforeEach(() => {
    vi.mocked(startConversation).mockReset();
    vi.mocked(loadAgentChoices).mockResolvedValue({ ok: true, choices: null });
  });

  it('offers no Skill chips', async () => {
    renderWithTheme(
      <ConversationDraft
        draft={{ key: 'a', intent: 'ask', ticketNumber: 42, text: '' }}
        onTextChange={vi.fn()}
        onStarted={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole('textbox', { name: 'Question' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Skills' })).toBeNull();
  });

  it('starts a New Ticket or New Epic Conversation on the Agent kind the User picks (T1368)', async () => {
    vi.mocked(loadAgentChoices).mockResolvedValue({
      ok: true,
      choices: agentChoices(),
    });
    vi.mocked(startConversation).mockResolvedValue({
      ok: true,
      conversation: aConversation({ id: 7 }),
    });
    renderWithTheme(
      <ConversationDraft
        draft={{
          key: 'b',
          intent: 'new_ticket',
          projectId: 3,
          text: 'Add a coupon field',
          defaults: { type: 'Epic' },
        }}
        onTextChange={vi.fn()}
        onStarted={vi.fn()}
      />,
    );

    await userEvent.selectOptions(
      await screen.findByLabelText('Agent'),
      'copilot',
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Message' }),
      '{Enter}',
    );

    expect(startConversation).toHaveBeenCalledWith({
      intent: 'new_ticket',
      prompt: 'Add a coupon field',
      projectId: 3,
      defaults: { type: 'Epic' },
      agentKind: 'copilot',
    });
    expect(loadAgentChoices).toHaveBeenCalledWith({ projectId: 3 });
  });

  it('asks about a Ticket on the picker of its Project', async () => {
    renderWithTheme(
      <ConversationDraft
        draft={{ key: 'c', intent: 'ask', ticketNumber: 42, text: '' }}
        onTextChange={vi.fn()}
        onStarted={vi.fn()}
      />,
    );

    await screen.findByRole('textbox', { name: 'Question' });
    expect(loadAgentChoices).toHaveBeenCalledWith({ ticketNumber: 42 });
  });
});
