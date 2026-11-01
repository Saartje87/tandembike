import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startConversation } from '../../app/conversations/actions';
import type { Conversation } from '../../conversations/conversations';
import { renderWithTheme } from '../../test/render';
import { TicketAgentActions } from './ticket-agent-actions';

vi.mock('../../app/conversations/actions', () => ({
  startConversation: vi.fn(),
}));

const started = {
  ok: true,
  conversation: { id: 9 } as Conversation,
} as const;

describe('TicketAgentActions', () => {
  beforeEach(() => {
    vi.mocked(startConversation).mockReset();
  });

  it('starts a Start Conversation with "Start T42"', async () => {
    vi.mocked(startConversation).mockResolvedValue(started);
    const onStarted = vi.fn();
    renderWithTheme(
      <TicketAgentActions ticketNumber={42} onStarted={onStarted} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(startConversation).toHaveBeenCalledWith({
      ticketNumber: 42,
      intent: 'start',
      prompt: 'Start T42',
    });
    expect(onStarted).toHaveBeenCalledWith(9);
  });

  it('starts a Triage Conversation with "Triage T42"', async () => {
    vi.mocked(startConversation).mockResolvedValue(started);
    renderWithTheme(<TicketAgentActions ticketNumber={42} />);

    await userEvent.click(screen.getByRole('button', { name: 'Triage' }));

    expect(startConversation).toHaveBeenCalledWith({
      ticketNumber: 42,
      intent: 'triage',
      prompt: 'Triage T42',
    });
  });

  it('asks through onAsk, starting nothing and showing no field', async () => {
    const onAsk = vi.fn();
    renderWithTheme(<TicketAgentActions ticketNumber={42} onAsk={onAsk} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ask' }));

    expect(onAsk).toHaveBeenCalledOnce();
    expect(startConversation).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Question')).toBeNull();
  });

  it('shows why a Start was refused', async () => {
    vi.mocked(startConversation).mockResolvedValue({
      ok: false,
      error: 'This Project already has a Start run working.',
    });
    renderWithTheme(<TicketAgentActions ticketNumber={42} />);

    await userEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Project already has a Start run working.',
    );
  });
});
