import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  answerConversationPermission,
  replyToConversation,
  stopConversation,
} from '../../app/conversations/actions';
import type {
  Conversation,
  TranscriptEntry,
} from '../../conversations/conversations';
import { renderWithTheme } from '../../test/render';
import {
  type ConversationWithTranscript,
  TicketConversations,
} from './ticket-conversations';

vi.mock('../../app/conversations/actions', () => ({
  answerConversationPermission: vi.fn(),
  replyToConversation: vi.fn(),
  stopConversation: vi.fn(),
}));

const at = new Date('2026-03-01T09:00:00Z');

const conversation = (values: Partial<Conversation>): Conversation => ({
  id: 1,
  projectId: 1,
  ticketNumber: 4,
  intent: 'start',
  state: 'idle',
  sdkSessionId: null,
  costUsd: 0,
  hidden: false,
  defaultCycleId: null,
  defaultEpicNumber: null,
  defaultType: null,
  createdAt: at,
  updatedAt: at,
  ...values,
});

const entry = (values: Partial<TranscriptEntry>): TranscriptEntry => ({
  id: 1,
  conversationId: 1,
  role: 'agent',
  text: '',
  permission: null,
  createdAt: at,
  ...values,
});

const one = (
  values: Partial<Conversation>,
  transcript: TranscriptEntry[] = [],
): ConversationWithTranscript => ({
  conversation: conversation(values),
  transcript,
});

const ok = (state: Conversation['state'] = 'running') =>
  ({ ok: true, conversation: conversation({ state }) }) as const;

describe('TicketConversations', () => {
  beforeEach(() => {
    vi.mocked(answerConversationPermission).mockReset();
    vi.mocked(replyToConversation).mockReset();
    vi.mocked(stopConversation).mockReset();
  });

  it('shows nothing when the Ticket has no Conversations', () => {
    renderWithTheme(<TicketConversations items={[]} />);

    expect(screen.queryByText('Conversations')).not.toBeInTheDocument();
  });

  it('lists the Conversations newest first and opens the newest', () => {
    renderWithTheme(
      <TicketConversations
        items={[
          one({ id: 2, intent: 'ask' }, [
            entry({ id: 5, conversationId: 2, text: 'Newest answer' }),
          ]),
          one({ id: 1 }, [
            entry({ id: 1, conversationId: 1, text: 'Oldest answer' }),
          ]),
        ]}
      />,
    );

    const buttons = within(
      screen.getByRole('list', { name: 'Conversations' }),
    ).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      expect.stringContaining('Ask'),
      expect.stringContaining('Start'),
    ]);
    expect(screen.getByText('Newest answer')).toBeInTheDocument();
    expect(screen.queryByText('Oldest answer')).not.toBeInTheDocument();
  });

  it('shows each Conversation with its running cost', () => {
    renderWithTheme(
      <TicketConversations
        items={[
          one({ id: 2, intent: 'ask', costUsd: 1.2345 }),
          one({ id: 1, costUsd: 0.5 }),
        ]}
      />,
    );

    const buttons = within(
      screen.getByRole('list', { name: 'Conversations' }),
    ).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Ask · waiting for you · $1.23',
      'Start · waiting for you · $0.50',
    ]);
    expect(screen.getByText('Ask, waiting for you, $1.23')).toBeInTheDocument();
  });

  it('opens another Conversation when picked', async () => {
    renderWithTheme(
      <TicketConversations
        items={[
          one({ id: 2, intent: 'ask' }),
          one({ id: 1 }, [
            entry({ id: 1, conversationId: 1, text: 'Oldest answer' }),
          ]),
        ]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /Start/ }));

    expect(screen.getByText('Oldest answer')).toBeInTheDocument();
  });

  it('shows the transcript with who said what', () => {
    renderWithTheme(
      <TicketConversations
        items={[
          one({}, [
            entry({ id: 1, role: 'user', text: 'Please start' }),
            entry({ id: 2, role: 'agent', text: 'On it' }),
            entry({ id: 3, role: 'tool', text: 'Read {"file_path":"a"}' }),
            entry({ id: 4, role: 'error', text: 'Went wrong' }),
          ]),
        ]}
      />,
    );

    const lines = within(
      screen.getByRole('list', { name: 'Transcript' }),
    ).getAllByRole('listitem');
    expect(lines).toHaveLength(4);
    expect(within(lines[0]).getByText('You')).toBeInTheDocument();
    expect(within(lines[1]).getByText('Agent')).toBeInTheDocument();
    expect(within(lines[2]).getByText('Read {"file_path":"a"}')).toBeVisible();
    expect(within(lines[3]).getByText('Went wrong')).toBeInTheDocument();
  });

  it('sends a reply and clears the field', async () => {
    vi.mocked(replyToConversation).mockResolvedValue(ok());
    renderWithTheme(<TicketConversations items={[one({ id: 7 })]} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Reply' }),
      'Go on',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(replyToConversation).toHaveBeenCalledWith({
      conversationId: 7,
      text: 'Go on',
    });
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('');
  });

  it('keeps the reply and shows the reason when it is refused', async () => {
    vi.mocked(replyToConversation).mockResolvedValue({
      ok: false,
      error: 'This Project has no repository path.',
    });
    renderWithTheme(<TicketConversations items={[one({})]} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Reply' }),
      'Go on',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText('This Project has no repository path.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('Go on');
  });

  it('stops a Conversation whose run is alive', async () => {
    vi.mocked(stopConversation).mockResolvedValue(ok('stopped'));
    renderWithTheme(
      <TicketConversations items={[one({ id: 7, state: 'running' })]} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(stopConversation).toHaveBeenCalledWith({ conversationId: 7 });
  });

  it('shows Allow and Deny for a pending permission request and sends the answer', async () => {
    vi.mocked(answerConversationPermission).mockResolvedValue(ok());
    renderWithTheme(
      <TicketConversations
        items={[
          one({ state: 'waiting' }, [
            entry({
              id: 9,
              role: 'permission',
              text: 'Bash {"command":"npm test"}',
              permission: 'pending',
            }),
          ]),
        ]}
      />,
    );

    expect(screen.getByText('Bash {"command":"npm test"}')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Allow' }));

    expect(answerConversationPermission).toHaveBeenCalledWith({
      entryId: 9,
      allow: true,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Deny' }));

    expect(answerConversationPermission).toHaveBeenLastCalledWith({
      entryId: 9,
      allow: false,
    });
  });

  it('shows how an answered or expired request ended, without buttons', () => {
    renderWithTheme(
      <TicketConversations
        items={[
          one({}, [
            entry({
              id: 1,
              role: 'permission',
              text: 'Bash a',
              permission: 'allowed',
            }),
            entry({
              id: 2,
              role: 'permission',
              text: 'Bash b',
              permission: 'denied',
            }),
            entry({
              id: 3,
              role: 'permission',
              text: 'Bash c',
              permission: 'expired',
            }),
          ]),
        ]}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Allow' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Allowed')).toBeInTheDocument();
    expect(screen.getByText('Denied')).toBeInTheDocument();
    expect(screen.getByText('Not answered')).toBeInTheDocument();
  });

  it('says an interrupted Conversation was interrupted and lets a reply resume it', () => {
    renderWithTheme(
      <TicketConversations items={[one({ state: 'interrupted' })]} />,
    );

    expect(screen.getByText(/was interrupted/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Reply' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Stop' }),
    ).not.toBeInTheDocument();
  });

  it('takes no reply once stopped', () => {
    renderWithTheme(
      <TicketConversations items={[one({ state: 'stopped' })]} />,
    );

    expect(screen.getByText(/was stopped/)).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Reply' }),
    ).not.toBeInTheDocument();
  });

  it('shows a small cost to more than the cent', () => {
    renderWithTheme(
      <TicketConversations
        items={[one({ costUsd: 0.0034 }), one({ id: 2, costUsd: 0 })]}
      />,
    );

    expect(
      screen.getByText(/\$0\.0034/, { selector: 'p, span' }),
    ).toBeInTheDocument();
  });

  it('does not link Ticket numbers the Agent merely mentions', () => {
    renderWithTheme(
      <TicketConversations
        items={[one({}, [entry({ id: 1, text: 'See T41 for context.' })])]}
      />,
    );

    expect(screen.queryByRole('link', { name: 'T41' })).not.toBeInTheDocument();
  });

  it('links the Tickets the Agent created', () => {
    renderWithTheme(
      <TicketConversations
        items={[
          one({}, [
            entry({ id: 1, role: 'created', text: 'Created T41, T42' }),
          ]),
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: 'T41' })).toHaveAttribute(
      'href',
      '/ticket/41',
    );
    expect(screen.getByRole('link', { name: 'T42' })).toHaveAttribute(
      'href',
      '/ticket/42',
    );
  });

  it('leaves out the list of Conversations when asked', () => {
    renderWithTheme(<TicketConversations items={[one({})]} showList={false} />);

    expect(
      screen.queryByRole('list', { name: 'Conversations' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Reply' })).toBeInTheDocument();
  });
});
