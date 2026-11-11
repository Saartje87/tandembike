// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  loadAgentChoices,
  startConversation,
} from '../../app/conversations/actions';
import type { Conversation } from '../../conversations/conversations';
import { agentChoices } from '../../test/fixtures';
import { renderWithTheme } from '../../test/render';
import { TicketAgentActions } from './ticket-agent-actions';

vi.mock('../../app/conversations/actions', () => ({
  startConversation: vi.fn(),
  loadAgentChoices: vi.fn(),
}));

const started = {
  ok: true,
  conversation: { id: 9 } as Conversation,
} as const;

describe('TicketAgentActions', () => {
  beforeEach(() => {
    vi.mocked(startConversation).mockReset();
    vi.mocked(loadAgentChoices).mockResolvedValue({ ok: true, choices: null });
  });

  it('shows Spec only when specAvailable, and starts the Spec Stage', async () => {
    vi.mocked(startConversation).mockResolvedValue(started);
    const onStarted = vi.fn();
    const { rerender } = renderWithTheme(
      <TicketAgentActions ticketNumber={5} />,
    );
    expect(screen.queryByRole('button', { name: 'Spec' })).toBeNull();

    rerender(
      <TicketAgentActions
        ticketNumber={5}
        specAvailable
        onStarted={onStarted}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Spec' }));

    expect(startConversation).toHaveBeenCalledWith({
      ticketNumber: 5,
      intent: 'spec',
      stage: { stage: 'spec' },
    });
    expect(onStarted).toHaveBeenCalledWith(9);
  });

  it("starts the Start Stage on the Ticket, which the runner words with the Project's command (ADR 0051)", async () => {
    vi.mocked(startConversation).mockResolvedValue(started);
    const onStarted = vi.fn();
    renderWithTheme(
      <TicketAgentActions ticketNumber={42} onStarted={onStarted} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(startConversation).toHaveBeenCalledWith({
      ticketNumber: 42,
      intent: 'start',
      stage: { stage: 'start' },
    });
    expect(onStarted).toHaveBeenCalledWith(9);
  });

  it('starts the Triage Stage on the Ticket', async () => {
    vi.mocked(startConversation).mockResolvedValue(started);
    renderWithTheme(<TicketAgentActions ticketNumber={42} />);

    await userEvent.click(screen.getByRole('button', { name: 'Triage' }));

    expect(startConversation).toHaveBeenCalledWith({
      ticketNumber: 42,
      intent: 'triage',
      stage: { stage: 'triage' },
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
      error:
        'This Project already has a Start run working: T3 (waiting on you). Answer, stop or close it first, or turn on Parallel runs in the Project settings to allow more.',
    });
    renderWithTheme(<TicketAgentActions ticketNumber={42} />);

    await userEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Project already has a Start run working: T3 (waiting on you). Answer, stop or close it first, or turn on Parallel runs in the Project settings to allow more.',
    );
  });

  it('shows a Start that throws as a refusal (T1321)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    vi.mocked(startConversation).mockRejectedValue(new Error('network down'));
    const onStarted = vi.fn();
    renderWithTheme(
      <TicketAgentActions ticketNumber={42} onStarted={onStarted} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The run could not be started. Try again.',
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled(),
    );
    expect(onStarted).not.toHaveBeenCalled();
  });

  it('starts Start, Triage and Spec on the Agent kind the User picks (T1368)', async () => {
    vi.mocked(loadAgentChoices).mockResolvedValue({
      ok: true,
      choices: agentChoices(),
    });
    vi.mocked(startConversation).mockResolvedValue(started);
    renderWithTheme(<TicketAgentActions ticketNumber={42} specAvailable />);

    await userEvent.selectOptions(
      await screen.findByLabelText('Agent'),
      'copilot',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Triage' }));

    await waitFor(() =>
      expect(startConversation).toHaveBeenCalledWith({
        ticketNumber: 42,
        intent: 'triage',
        stage: { stage: 'triage' },
        agentKind: 'copilot',
      }),
    );
    expect(loadAgentChoices).toHaveBeenCalledWith({ ticketNumber: 42 });
  });

  it('offers no picker on an archived Ticket, which only Ask reaches', async () => {
    vi.mocked(loadAgentChoices).mockResolvedValue({
      ok: true,
      choices: agentChoices(),
    });
    renderWithTheme(<TicketAgentActions ticketNumber={42} askOnly />);

    await screen.findByRole('button', { name: 'Ask' });
    expect(screen.queryByLabelText('Agent')).not.toBeInTheDocument();
  });
});
