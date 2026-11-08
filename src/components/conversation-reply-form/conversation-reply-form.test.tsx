import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { replyToConversation } from '../../app/conversations/actions';
import { renderWithTheme } from '../../test/render';
import { ConversationReplyForm } from './conversation-reply-form';

vi.mock('../../app/conversations/actions', () => ({
  replyToConversation: vi.fn(),
}));
vi.mock('../../app/projects/actions', () => ({
  loadProjectSkills: vi.fn().mockResolvedValue({ ok: true, skills: [] }),
}));

describe('ConversationReplyForm', () => {
  beforeEach(() => {
    vi.mocked(replyToConversation).mockReset();
  });

  it('sends the reply to its Conversation and clears the input', async () => {
    vi.mocked(replyToConversation).mockResolvedValue({
      ok: true,
      conversation: {} as never,
    });
    renderWithTheme(<ConversationReplyForm conversationId={4} projectId={3} />);
    const field = screen.getByRole('textbox', { name: 'Reply' });

    await userEvent.type(field, 'Go on{Enter}');

    expect(replyToConversation).toHaveBeenCalledExactlyOnceWith({
      conversationId: 4,
      text: 'Go on',
    });
    expect(field).toHaveValue('');
  });

  it('shows the Server Action’s refusal and keeps the reply (T1185)', async () => {
    vi.mocked(replyToConversation).mockResolvedValue({
      ok: false,
      error: 'Set a repository path in the Project settings first.',
    });
    renderWithTheme(<ConversationReplyForm conversationId={4} projectId={3} />);
    const field = screen.getByRole('textbox', { name: 'Reply' });

    await userEvent.type(field, 'Go on{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Set a repository path',
    );
    expect(field).toHaveValue('Go on');
  });

  it('shows a reply whose Server Action throws as a refusal, not an uncaught rejection (T1185)', async () => {
    vi.mocked(replyToConversation).mockRejectedValue(new Error('boom'));
    renderWithTheme(<ConversationReplyForm conversationId={4} projectId={3} />);
    const field = screen.getByRole('textbox', { name: 'Reply' });

    await userEvent.type(field, 'Go on{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not be sent',
    );
    expect(field).toHaveValue('Go on');
  });
});
