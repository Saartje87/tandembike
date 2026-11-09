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

const commands = {
  triageCommand: '/mattpocock-skills:triage',
  startCommand: '/mattpocock-skills:implement',
  startEpicCommand: '/mattpocock-skills:implement-spec',
  retroCommand: '/retro',
  specCommand: '/spec',
};

const none = {
  triageCommand: null,
  startCommand: null,
  startEpicCommand: null,
  retroCommand: null,
  specCommand: null,
};

const started = {
  ok: true,
  conversation: { id: 9 } as Conversation,
} as const;

describe('TicketAgentActions', () => {
  beforeEach(() => {
    vi.mocked(startConversation).mockReset();
  });

  it("sends the Project's Start command with the Ticket number", async () => {
    vi.mocked(startConversation).mockResolvedValue(started);
    renderWithTheme(
      <TicketAgentActions
        ticketNumber={42}
        ticketType="Ticket"
        commands={commands}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(startConversation).toHaveBeenCalledWith({
      ticketNumber: 42,
      intent: 'start',
      prompt: '/mattpocock-skills:implement T42',
    });
  });

  it('sends the Start command for Epics on an Epic, and the Playbook one when it is blank', async () => {
    vi.mocked(startConversation).mockResolvedValue(started);
    const { rerender } = renderWithTheme(
      <TicketAgentActions
        ticketNumber={7}
        ticketType="Epic"
        commands={commands}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(startConversation).toHaveBeenLastCalledWith({
      ticketNumber: 7,
      intent: 'start',
      prompt: '/mattpocock-skills:implement-spec T7',
    });

    rerender(
      <TicketAgentActions
        ticketNumber={7}
        ticketType="Epic"
        commands={{ ...commands, startEpicCommand: null }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(startConversation).toHaveBeenLastCalledWith({
      ticketNumber: 7,
      intent: 'start',
      prompt: '/tandembike:implement-epic T7',
    });

    rerender(
      <TicketAgentActions
        ticketNumber={7}
        ticketType="Epic"
        commands={{ ...none, triageCommand: '/triage' }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(startConversation).toHaveBeenLastCalledWith({
      ticketNumber: 7,
      intent: 'start',
      prompt: '/tandembike:implement-epic T7',
    });
  });

  it("sends the Project's Triage command on a Ticket and an Epic alike", async () => {
    vi.mocked(startConversation).mockResolvedValue(started);
    const { rerender } = renderWithTheme(
      <TicketAgentActions
        ticketNumber={42}
        ticketType="Ticket"
        commands={commands}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Triage' }));
    expect(startConversation).toHaveBeenLastCalledWith({
      ticketNumber: 42,
      intent: 'triage',
      prompt: '/mattpocock-skills:triage T42',
    });

    rerender(
      <TicketAgentActions
        ticketNumber={7}
        ticketType="Epic"
        commands={commands}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Triage' }));
    expect(startConversation).toHaveBeenLastCalledWith({
      ticketNumber: 7,
      intent: 'triage',
      prompt: '/mattpocock-skills:triage T7',
    });
  });

  it('shows Spec only when canSpec, and sends /tandembike:spec when blank', async () => {
    vi.mocked(startConversation).mockResolvedValue(started);
    const onStarted = vi.fn();
    const { rerender } = renderWithTheme(
      <TicketAgentActions
        ticketNumber={5}
        ticketType="Ticket"
        commands={none}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Spec' })).toBeNull();

    rerender(
      <TicketAgentActions
        ticketNumber={5}
        ticketType="Ticket"
        commands={none}
        canSpec
        onStarted={onStarted}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Spec' }));

    expect(startConversation).toHaveBeenCalledWith({
      ticketNumber: 5,
      intent: 'spec',
      prompt: '/tandembike:spec T5',
    });
    expect(onStarted).toHaveBeenCalledWith(9);
  });

  it('sends the Spec command override when set', async () => {
    vi.mocked(startConversation).mockResolvedValue(started);
    renderWithTheme(
      <TicketAgentActions
        ticketNumber={5}
        ticketType="Epic"
        commands={{ ...none, specCommand: '/my:spec' }}
        canSpec
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Spec' }));
    expect(startConversation).toHaveBeenCalledWith({
      ticketNumber: 5,
      intent: 'spec',
      prompt: '/my:spec T5',
    });
  });

  it('starts a Start Conversation with /tandembike:implement when the Project has no command', async () => {
    vi.mocked(startConversation).mockResolvedValue(started);
    const onStarted = vi.fn();
    renderWithTheme(
      <TicketAgentActions
        ticketNumber={42}
        ticketType="Ticket"
        commands={none}
        onStarted={onStarted}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(startConversation).toHaveBeenCalledWith({
      ticketNumber: 42,
      intent: 'start',
      prompt: '/tandembike:implement T42',
    });
    expect(onStarted).toHaveBeenCalledWith(9);
  });

  it('starts a Triage Conversation with /tandembike:triage when the Project has no command', async () => {
    vi.mocked(startConversation).mockResolvedValue(started);
    renderWithTheme(
      <TicketAgentActions
        ticketNumber={42}
        ticketType="Ticket"
        commands={none}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Triage' }));

    expect(startConversation).toHaveBeenCalledWith({
      ticketNumber: 42,
      intent: 'triage',
      prompt: '/tandembike:triage T42',
    });
  });

  it('asks through onAsk, starting nothing and showing no field', async () => {
    const onAsk = vi.fn();
    renderWithTheme(
      <TicketAgentActions
        ticketNumber={42}
        ticketType="Ticket"
        commands={none}
        onAsk={onAsk}
      />,
    );

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
    renderWithTheme(
      <TicketAgentActions
        ticketNumber={42}
        ticketType="Ticket"
        commands={none}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This Project already has a Start run working.',
    );
  });
});
