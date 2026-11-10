import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aConversation } from '../../test/fixtures';
import { renderWithTheme } from '../../test/render';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { TicketConversationList } from './ticket-conversation-list';

vi.mock('../conversation-dialog-provider/conversation-dialog-provider', () => ({
  useConversationDialog: vi.fn(),
}));

describe('TicketConversationList', () => {
  beforeEach(() => {
    vi.mocked(useConversationDialog).mockReturnValue({
      conversations: [],
      open: vi.fn(),
      show: vi.fn(),
      reopenAndOpen: vi.fn(),
      openDraft: vi.fn(),
      shown: false,
    });
  });

  it('names a Batch triage by its intent (T1319)', () => {
    renderWithTheme(
      <TicketConversationList
        conversations={[
          aConversation({
            intent: 'batch_triage',
            state: 'running',
            batchTriageTickets: [4],
          }),
        ]}
      />,
    );

    expect(
      screen.getByRole('button', { name: /^Batch triage · / }),
    ).toBeInTheDocument();
  });
});
