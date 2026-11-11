// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aConversation, aFootprint } from '../../test/fixtures';
import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { TicketConversationList } from './ticket-conversation-list';

vi.mock('../conversation-dialog-provider/conversation-dialog-provider', () => ({
  useConversationDialog: vi.fn(),
}));

showOpenPopovers();

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
        footprints={{}}
      />,
    );

    expect(
      screen.getByRole('button', { name: /^Batch triage · / }),
    ).toBeInTheDocument();
  });

  it('shows each Conversation’s Footprint next to its cost (T1176)', () => {
    renderWithTheme(
      <TicketConversationList
        conversations={[
          aConversation({ id: 1, intent: 'start', state: 'idle', cost: 1 }),
          aConversation({
            id: 2,
            intent: 'triage',
            state: 'idle',
            cost: 0.2,
          }),
        ]}
        footprints={{ 1: aFootprint() }}
      />,
    );

    const [start, triage] = screen.getAllByRole('listitem');
    expect(
      within(start).getByRole('button', {
        name: 'Start · waiting for you · $1.00',
      }),
    ).toBeInTheDocument();
    expect(
      within(start).getByText('~12 Wh · ~5.7 g CO₂e est.'),
    ).toBeInTheDocument();
    expect(
      within(triage).getByRole('button', {
        name: 'Triage · waiting for you · $0.20',
      }),
    ).toBeInTheDocument();
    expect(
      within(triage).getByText('Footprint not measured'),
    ).toBeInTheDocument();
  });

  it('gives the comparisons in a tooltip on the Footprint, not the whole row (T1347)', async () => {
    renderWithTheme(
      <TicketConversationList
        conversations={[aConversation({ id: 1 })]}
        footprints={{ 1: aFootprint() }}
      />,
    );

    await userEvent.hover(screen.getByRole('button', { name: /^Start · / }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await userEvent.hover(screen.getByText('~12 Wh · ~5.7 g CO₂e est.'));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '≈ 0.6 phone charges',
    );
  });

  it('still opens the Conversation from its button (T1347)', async () => {
    const conversation = aConversation({ id: 1 });
    renderWithTheme(
      <TicketConversationList
        conversations={[conversation]}
        footprints={{ 1: aFootprint() }}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Start · waiting for you · $0.00' }),
    );

    expect(useConversationDialog().reopenAndOpen).toHaveBeenCalledWith(
      conversation,
    );
  });
});
