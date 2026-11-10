// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  answerConversationPermission,
  answerConversationWidget,
  closeConversation,
  replyToConversation,
  stopConversation,
} from '../../app/conversations/actions';
import type { QuestionEntry } from '../../conversations/conversation-state';
import type {
  Conversation,
  TranscriptEntry,
} from '../../conversations/conversations';
import { aConversation, aFootprint } from '../../test/fixtures';
import { renderWithTheme } from '../../test/render';
import type { ConversationWithTranscript } from '../conversation-labels/conversation-labels';
import { ConversationChat } from './conversation-chat';

vi.mock('../../app/conversations/actions', () => ({
  closeConversation: vi.fn(),
  answerConversationPermission: vi.fn(),
  answerConversationWidget: vi.fn(),
  replyToConversation: vi.fn(),
  stopConversation: vi.fn(),
}));

const at = new Date('2026-03-01T09:00:00Z');

const conversation = (values: Partial<Conversation>): Conversation =>
  aConversation({ ticketNumber: 4, createdAt: at, updatedAt: at, ...values });

const entry = (values: Partial<TranscriptEntry>): TranscriptEntry => ({
  id: 1,
  conversationId: 1,
  role: 'agent',
  text: '',
  permission: null,
  permissionRules: null,
  toolName: null,
  toolInput: null,
  question: null,
  widget: null,
  createdAt: at,
  answeredAt: null,
  ...values,
});

const one = (
  values: Partial<Conversation>,
  transcript: TranscriptEntry[] = [],
): ConversationWithTranscript => ({
  conversation: conversation(values),
  transcript,
  footprint: { measured: false },
});

const ok = (state: Conversation['state'] = 'running') =>
  ({ ok: true, conversation: conversation({ state }) }) as const;

describe('ConversationChat', () => {
  beforeEach(() => {
    vi.mocked(answerConversationPermission).mockReset();
    vi.mocked(answerConversationWidget).mockReset();
    vi.mocked(replyToConversation).mockReset();
    vi.mocked(stopConversation).mockReset();
  });

  it('shows the worktree path in the header while there is one', () => {
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ worktreePath: '/wt/1/c1' }, [])}
      />,
    );

    expect(screen.getByText('Worktree: /wt/1/c1')).toBeInTheDocument();
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

  it('shows the title, then intent, state, cost and starter as one meta line', () => {
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ intent: 'triage', state: 'running', costUsd: 0.5 })}
      />,
    );

    expect(screen.getByText('T4 A Ticket')).toBeInTheDocument();
    expect(
      screen.getByText('Triage, working, $0.50, by you'),
    ).toBeInTheDocument();
  });

  it('shows the Footprint after the meta line, marked as an estimate (T1176)', () => {
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={{
          ...one({ costUsd: 0.5 }),
          footprint: aFootprint({ energyWh: 2400, co2eG: 1140 }),
        }}
      />,
    );

    expect(
      screen.getByText('~2.4 kWh · ~1.1 kg CO₂e est.'),
    ).toBeInTheDocument();
  });

  it('says a Conversation without recorded tokens is not measured (T1176)', () => {
    renderWithTheme(<ConversationChat title="T4" item={one({})} />);

    expect(screen.getByText('Footprint not measured')).toBeInTheDocument();
  });

  it('names who started the Conversation in the meta line', () => {
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ startedBy: 'autopilot', costUsd: 1.15 })}
      />,
    );
    expect(screen.getByText(/, \$1\.15, by Autopilot$/)).toBeInTheDocument();
  });

  it('offers Stop after the title and meta, at the end of the header row', () => {
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ state: 'running', sdkSessionId: 'session-1' })}
      />,
    );

    const meta = screen.getByText(/by you$/);
    const following = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const resume = screen.getByRole('button', { name: 'Continue in terminal' });
    const stop = screen.getByRole('button', { name: 'Stop' });
    expect(following(screen.getByText('T4 A Ticket'), meta)).toBe(true);
    expect(following(meta, resume)).toBe(true);
    expect(following(resume, stop)).toBe(true);
  });

  it("shows an Autopilot message apart from the User's", () => {
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({}, [
          entry({ id: 1, role: 'user', text: 'Hi' }),
          entry({ id: 2, role: 'autopilot', text: 'The server restarted.' }),
        ])}
      />,
    );

    const lines = within(
      screen.getByRole('list', { name: 'Transcript' }),
    ).getAllByRole('listitem');
    expect(within(lines[1]).getByText('Autopilot')).toBeInTheDocument();
    expect(within(lines[1]).getByText('The server restarted.')).toBeVisible();
    expect(lines[1]).not.toHaveAttribute('data-side', 'end');
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

  it('shows a Stop whose action throws as a refusal (T1186)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    vi.mocked(stopConversation).mockRejectedValue(new Error('network down'));
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ id: 7, state: 'running' })}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(
      await screen.findByText('The run could not be stopped. Try again.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Stop' })).toBeEnabled(),
    );
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
      answer: 'allow',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Deny' }));

    expect(answerConversationPermission).toHaveBeenLastCalledWith({
      entryId: 9,
      answer: 'deny',
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
    expect(screen.queryByRole('alert')).toBeNull();
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
    expect(screen.queryByRole('alert')).toBeNull();
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

  it('renders the Markdown and line breaks of Agent and User messages', () => {
    const { container } = renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({}, [
          entry({
            id: 1,
            role: 'agent',
            text: '# Plan\n\nFix **the** header.',
          }),
          entry({ id: 2, role: 'user', text: 'first line\nsecond line' }),
        ])}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 4, name: 'Plan' }),
    ).toBeInTheDocument();
    expect(screen.getByText('the').tagName).toBe('STRONG');
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  it('shows the Tickets the Agent created as a line linking each', () => {
    renderWithTheme(
      <ConversationChat
        title="T4"
        item={one({}, [
          entry({ id: 1, role: 'created', text: 'Created T41, T42' }),
        ])}
      />,
    );

    expect(screen.getByRole('link', { name: 'T41' })).toHaveAttribute(
      'href',
      '/ticket/41',
    );
    expect(screen.getByRole('link', { name: 'T42' })).toBeInTheDocument();
    expect(screen.queryByText('Permission')).toBeNull();
  });

  it('shows a cost under a cent to 4 places', () => {
    renderWithTheme(
      <ConversationChat title="T4" item={one({ costUsd: 0.0034 })} />,
    );

    expect(screen.getByText(/\$0\.0034/)).toBeInTheDocument();
  });

  it('shows tool lines as plain text', () => {
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({}, [entry({ id: 1, role: 'tool', text: 'Read **x**' })])}
      />,
    );

    expect(screen.getByText('Read **x**')).toBeInTheDocument();
  });

  describe('option chips', () => {
    const asking = (text: string, state: Conversation['state'] = 'idle') =>
      one({ id: 7, state }, [entry({ id: 1, text })]);

    it('sends the choice of a single question with the typed text', async () => {
      vi.mocked(replyToConversation).mockResolvedValue(ok());
      renderWithTheme(
        <ConversationChat
          title="T4"
          item={asking('Which way?\n1. Left\n2. Right')}
        />,
      );

      await userEvent.type(
        screen.getByRole('textbox', { name: 'Reply' }),
        'because',
      );
      await userEvent.click(screen.getByRole('button', { name: '2) Right' }));

      expect(replyToConversation).toHaveBeenCalledWith({
        conversationId: 7,
        text: 'because\n2',
      });
    });

    it('adds a line per question to the input without sending', async () => {
      renderWithTheme(
        <ConversationChat
          title="T4"
          item={asking(
            '1. DB?\n   a) SQLite\n   b) Postgres\n2. UI?\n   a) Web\n   b) CLI',
          )}
        />,
      );

      await userEvent.click(
        screen.getByRole('button', { name: 'b) Postgres' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'a) Web' }));
      await userEvent.click(screen.getByRole('button', { name: 'a) SQLite' }));

      expect(replyToConversation).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: 'Reply' })).toHaveValue(
        'Q2: a\nQ1: a',
      );
    });

    it('shows chips only on the latest agent message', () => {
      renderWithTheme(
        <ConversationChat
          title="T4"
          item={one({ state: 'idle' }, [
            entry({ id: 1, text: '1. Left\n2. Right' }),
            entry({ id: 2, role: 'user', text: '1' }),
            entry({ id: 3, text: 'Done' }),
          ])}
        />,
      );

      expect(screen.queryByRole('button', { name: /Left/ })).toBeNull();
    });

    it('shows no chips while the Agent is working', () => {
      renderWithTheme(
        <ConversationChat
          title="T4"
          item={asking('1. Left\n2. Right', 'running')}
        />,
      );

      expect(screen.queryByRole('button', { name: /Left/ })).toBeNull();
    });
  });

  it('shows a waiting Widget of the Agent and answers it through its action', async () => {
    vi.mocked(answerConversationWidget).mockResolvedValue(ok());
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ id: 1, state: 'waiting' }, [
          entry({
            id: 6,
            role: 'widget',
            text: 'Which library?',
            widget: {
              widget: {
                kind: 'choice',
                prompt: 'Which library?',
                options: [{ label: 'Alpha' }, { label: 'Beta' }],
                multiSelect: false,
                recommended: ['Beta'],
              },
              answer: null,
              expired: false,
            },
          }),
        ])}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Send answer' }));

    expect(answerConversationWidget).toHaveBeenCalledWith({
      conversationId: 1,
      entryId: 6,
      answer: { selected: ['Beta'] },
    });
  });

  describe('an Agent question of an older run', () => {
    const library = {
      question: 'Which library?',
      header: 'Library',
      multiSelect: false,
      options: [
        { label: 'Alpha', description: 'The first' },
        { label: 'Beta', description: 'The second' },
      ],
    };
    const renderQuestion = (question: Partial<QuestionEntry>) =>
      renderWithTheme(
        <ConversationChat
          title="T4 A Ticket"
          item={one({ state: 'waiting' }, [
            entry({
              id: 5,
              role: 'question',
              text: 'Which library?',
              question: {
                questions: [library],
                answers: null,
                expired: false,
                ...question,
              },
            }),
          ])}
        />,
      );

    it('shows what was answered, without choices', () => {
      renderQuestion({ answers: { 'Which library?': 'Beta' } });

      expect(screen.getByText('Which library?')).toBeInTheDocument();
      expect(screen.getByText('Beta')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
    });

    it('shows an expired question as not answered', () => {
      renderQuestion({ expired: true });

      expect(screen.getByText('Not answered')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Alpha' })).toBeNull();
    });
  });
});

describe('ConversationChat of a Terminal Conversation (T1237)', () => {
  beforeEach(() => {
    vi.mocked(closeConversation).mockReset();
  });

  it('shows Terminal as the starter, no cost, no Stop and no reply box while open', () => {
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ startedBy: 'terminal', state: 'running' })}
      />,
    );

    expect(screen.getByText('Start, working, by Terminal')).toBeInTheDocument();
    expect(screen.getByText('Running in a terminal')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('shows the cost a UI run spent before the hand-off (T1196)', () => {
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ startedBy: 'terminal', state: 'running', costUsd: 0.75 })}
      />,
    );

    expect(
      screen.getByText('Start, working, $0.75, by Terminal'),
    ).toBeInTheDocument();
  });

  it('offers Close once the session has ended, and closes the Conversation', async () => {
    vi.mocked(closeConversation).mockResolvedValue(ok('stopped'));
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ id: 9, startedBy: 'terminal', state: 'stopped' }, [
          entry({
            id: 1,
            role: 'session',
            text: 'Session ended (exit code 0).',
          }),
        ])}
      />,
    );

    expect(screen.getByText('Session ended (exit code 0).')).toBeVisible();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(/Reply to resume it/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(closeConversation).toHaveBeenCalledWith({ conversationId: 9 });
  });
});

describe('ConversationChat Continue in terminal (T1241)', () => {
  const continueButton = () =>
    screen.queryByRole('button', { name: 'Continue in terminal' });

  it('shows only for a non-Terminal Conversation with an SDK session', () => {
    const { rerender } = renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ sdkSessionId: 'sess-1' })}
      />,
    );
    expect(continueButton()).toBeInTheDocument();

    rerender(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ sdkSessionId: null })}
      />,
    );
    expect(continueButton()).toBeNull();

    rerender(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ sdkSessionId: 'sess-1', startedBy: 'terminal' })}
      />,
    );
    expect(continueButton()).toBeNull();
  });

  it('copies tandembike resume with the Conversation id', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <ConversationChat
        title="T4 A Ticket"
        item={one({ id: 12, sdkSessionId: 'sess-1' })}
      />,
    );

    await user.click(continueButton() as HTMLElement);

    expect(
      await screen.findByText('Copied: tandembike resume 12'),
    ).toBeVisible();
    expect(await navigator.clipboard.readText()).toBe('tandembike resume 12');
  });
});
