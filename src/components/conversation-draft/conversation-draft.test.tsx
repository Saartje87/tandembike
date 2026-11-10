import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { ConversationDraft } from './conversation-draft';

vi.mock('../../app/conversations/actions', () => ({
  startConversation: vi.fn(),
}));

describe('ConversationDraft', () => {
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
});
