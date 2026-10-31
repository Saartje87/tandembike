import { screen, waitFor, within } from '@testing-library/react';
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
import type { ConversationWithTranscript } from '../conversation-labels/conversation-labels';
import { ConversationChat } from './conversation-chat';

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

describe('ConversationChat', () => {
  beforeEach(() => {
    vi.mocked(answerConversationPermission).mockReset();
    vi.mocked(replyToConversation).mockReset();
    vi.mocked(stopConversation).mockReset();
  });

  it('shows the transcript with who said what', () => {
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({}, [
          entry({ id: 1, role: 'user', text: 'Please start' }),
          entry({ id: 2, role: 'agent', text: 'On it' }),
          entry({ id: 3, role: 'tool', text: 'Read {"file_path":"a"}' }),
          entry({ id: 4, role: 'error', text: 'Went wrong' }),
        ])}
      />,
    );

    const lines = within(
      screen.getByRole('list', { name: 'Transcript' }),
    ).getAllByRole('listitem');
    expect(lines).toHaveLength(4);
    expect(within(lines[0]).getByText('You')).toBeInTheDocument();
    expect(lines[0]).toHaveAttribute('data-side', 'end');
    expect(lines[1]).toHaveAttribute('data-side', 'start');
    expect(within(lines[1]).getByText('Agent')).toBeInTheDocument();
    expect(within(lines[2]).getByText('Read {"file_path":"a"}')).toBeVisible();
    expect(within(lines[3]).getByText('Went wrong')).toBeInTheDocument();
  });

  it('shows the title, intent, state and cost in the header', () => {
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ intent: 'triage', state: 'running', costUsd: 0.5 })}
      />,
    );

    expect(screen.getByText('T4 A Ticket')).toBeInTheDocument();
    expect(screen.getByText('Triage, working, $0.50')).toBeInTheDocument();
  });

  it('sends a reply with Enter and clears the field', async () => {
    vi.mocked(replyToConversation).mockResolvedValue(ok());
    renderWithTheme(<ConversationChat title="T4" item={one({ id: 7 })} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Reply' }),
      'Go on{Enter}',
    );

    expect(replyToConversation).toHaveBeenCalledWith({
      conversationId: 7,
      text: 'Go on',
    });
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue(''),
    );
  });

  it('starts a new line with Shift+Enter without sending', async () => {
    renderWithTheme(<ConversationChat title="T4" item={one({ id: 7 })} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Reply' }),
      'one{Shift>}{Enter}{/Shift}two',
    );

    expect(replyToConversation).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue(
      'one\ntwo',
    );
  });

  it('does not send an empty reply with Enter', async () => {
    renderWithTheme(<ConversationChat title="T4" item={one({ id: 7 })} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Reply' }),
      '{Enter}',
    );

    expect(replyToConversation).not.toHaveBeenCalled();
  });

  it('keeps the reply and shows the reason when Enter is refused', async () => {
    vi.mocked(replyToConversation).mockResolvedValue({
      ok: false,
      error: 'Nope.',
    });
    renderWithTheme(<ConversationChat title="T4" item={one({})} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Reply' }),
      'Go on{Enter}',
    );

    expect(await screen.findByText('Nope.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue('Go on');
  });

  it('scrolls to the newest message when one arrives', () => {
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(500);
    const first = one({}, [entry({ id: 1, text: 'a' })]);
    const { rerender } = renderWithTheme(
      <ConversationChat title="T4" item={first} />,
    );
    const list = screen.getByRole('list', { name: 'Transcript' });
    const scroller = list.parentElement as HTMLElement;
    scroller.scrollTop = 0;

    scrollHeight.mockReturnValue(900);
    rerender(
      <ConversationChat
        title="T4"
        item={one({}, [
          entry({ id: 1, text: 'a' }),
          entry({ id: 2, text: 'b' }),
        ])}
      />,
    );

    expect(scroller.scrollTop).toBe(900);
    scrollHeight.mockRestore();
  });

  it('sends a reply and clears the field', async () => {
    vi.mocked(replyToConversation).mockResolvedValue(ok());
    renderWithTheme(
      <ConversationChat title="T4 A Ticket" item={one({ id: 7 })} />,
    );

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
    renderWithTheme(<ConversationChat title="T4 A Ticket" item={one({})} />);

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
      <ConversationChat
        title="T4 A Ticket"
        item={one({ id: 7, state: 'running' })}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(stopConversation).toHaveBeenCalledWith({ conversationId: 7 });
  });

  it('shows Allow and Deny for a pending permission request and sends the answer', async () => {
    vi.mocked(answerConversationPermission).mockResolvedValue(ok());
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ state: 'waiting' }, [
          entry({
            id: 9,
            role: 'permission',
            text: 'Bash {"command":"npm test"}',
            permission: 'pending',
          }),
        ])}
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
      <ConversationChat
        title="T4 A Ticket"
        item={one({}, [
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
        ])}
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
      <ConversationChat
        title="T4 A Ticket"
        item={one({ state: 'interrupted' })}
      />,
    );

    expect(screen.getByText(/was interrupted/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Reply' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Stop' }),
    ).not.toBeInTheDocument();
  });

  it('says a stopped Conversation was stopped and lets a reply resume it', () => {
    renderWithTheme(
      <ConversationChat title="T4 A Ticket" item={one({ state: 'stopped' })} />,
    );

    expect(screen.getByText(/was stopped/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Reply' })).toBeEnabled();
  });

  it('links the Tickets named in the transcript', () => {
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({}, [entry({ id: 1, text: 'Created T41, then T42.' })])}
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
});
