import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aConversation } from '../../test/fixtures';
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
          aConversation({ id: 1, intent: 'start', state: 'idle', costUsd: 1 }),
          aConversation({
            id: 2,
            intent: 'triage',
            state: 'idle',
            costUsd: 0.2,
          }),
        ]}
        footprints={{
          1: {
            measured: true,
            energyWh: 12,
            co2eG: 5.7,
            phoneCharges: 0.63,
            carKm: 0.023,
          },
        }}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Start · waiting for you · $1.00 · ~12 Wh · ~5.7 g CO₂e est.',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Triage · waiting for you · $0.20 · Footprint not measured',
      }),
    ).toBeInTheDocument();
  });

  it('gives a Footprint’s comparisons in a tooltip on its row (T1176)', async () => {
    renderWithTheme(
      <TicketConversationList
        conversations={[aConversation({ id: 1 })]}
        footprints={{
          1: {
            measured: true,
            energyWh: 12,
            co2eG: 5.7,
            phoneCharges: 0.63,
            carKm: 0.023,
          },
        }}
      />,
    );

    await userEvent.hover(screen.getByRole('button', { name: /CO₂e est\.$/ }));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '≈ 0.63 phone charges · ≈ 0.023 km by car',
    );
  });
});
