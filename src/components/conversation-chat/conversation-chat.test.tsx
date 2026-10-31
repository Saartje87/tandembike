import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  answerConversationPermission,
  answerConversationQuestion,
  replyToConversation,
  stopConversation,
} from '../../app/conversations/actions';
import type { QuestionEntry } from '../../conversations/conversation-state';
import type {
  Conversation,
  TranscriptEntry,
} from '../../conversations/conversations';
import { renderWithTheme } from '../../test/render';
import type { ConversationWithTranscript } from '../conversation-labels/conversation-labels';
import { ConversationChat } from './conversation-chat';

vi.mock('../../app/conversations/actions', () => ({
  answerConversationPermission: vi.fn(),
  answerConversationQuestion: vi.fn(),
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
  question: null,
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
    vi.mocked(answerConversationQuestion).mockReset();
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

  describe('an Agent question', () => {
    const library = {
      question: 'Which library?',
      header: 'Library',
      multiSelect: false,
      options: [
        { label: 'Alpha', description: 'The first' },
        { label: 'Beta', description: 'The second' },
      ],
    };
    const features = {
      question: 'Which features?',
      header: 'Features',
      multiSelect: true,
      options: [
        { label: 'Fast', description: 'Quick' },
        { label: 'Small', description: 'Tiny' },
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

    it('answers a single single-choice question with one click on a choice', async () => {
      vi.mocked(answerConversationQuestion).mockResolvedValue(ok());
      renderQuestion({});

      await userEvent.click(screen.getByRole('button', { name: 'Beta' }));

      expect(answerConversationQuestion).toHaveBeenCalledWith({
        entryId: 5,
        answers: { 'Which library?': 'Beta' },
      });
    });

    it('also takes an Other answer for a single question', async () => {
      vi.mocked(answerConversationQuestion).mockResolvedValue(ok());
      renderQuestion({});
      const send = screen.getByRole('button', { name: 'Send answer' });
      expect(send).toBeDisabled();

      await userEvent.type(
        screen.getByRole('textbox', { name: 'Other answer to Which library?' }),
        'Gamma',
      );
      await userEvent.click(send);

      expect(answerConversationQuestion).toHaveBeenCalledWith({
        entryId: 5,
        answers: { 'Which library?': 'Gamma' },
      });
    });

    it('shows checkboxes for a multi-select question and sends the picked choices with Other', async () => {
      vi.mocked(answerConversationQuestion).mockResolvedValue(ok());
      renderQuestion({ questions: [features] });

      await userEvent.click(screen.getByRole('checkbox', { name: 'Fast' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Small' }));
      await userEvent.type(
        screen.getByRole('textbox', {
          name: 'Other answer to Which features?',
        }),
        'Cheap',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      expect(answerConversationQuestion).toHaveBeenCalledWith({
        entryId: 5,
        answers: { 'Which features?': 'Fast, Small, Cheap' },
      });
    });

    it('activates Submit only once every question has an answer, and sends all in one answer', async () => {
      vi.mocked(answerConversationQuestion).mockResolvedValue(ok());
      renderQuestion({ questions: [library, features] });
      const submit = screen.getByRole('button', { name: 'Submit' });
      expect(submit).toBeDisabled();

      await userEvent.click(screen.getByRole('radio', { name: 'Alpha' }));
      expect(submit).toBeDisabled();
      await userEvent.click(screen.getByRole('checkbox', { name: 'Small' }));
      expect(submit).toBeEnabled();
      await userEvent.click(submit);

      expect(answerConversationQuestion).toHaveBeenCalledTimes(1);
      expect(answerConversationQuestion).toHaveBeenCalledWith({
        entryId: 5,
        answers: { 'Which library?': 'Alpha', 'Which features?': 'Small' },
      });
    });

    it('shows a refusal', async () => {
      vi.mocked(answerConversationQuestion).mockResolvedValue({
        ok: false,
        error: 'This question is no longer waiting.',
      });
      renderQuestion({});

      await userEvent.click(screen.getByRole('button', { name: 'Alpha' }));

      expect(
        await screen.findByText('This question is no longer waiting.'),
      ).toBeInTheDocument();
    });

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
