import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  answerConversationQuestion,
  closeConversation,
  listOpenConversations,
  loadConversation,
  reopenConversation,
  replyToConversation,
  startConversation,
} from '../../app/conversations/actions';
import type { QuestionEntry } from '../../conversations/conversation-state';
import type {
  Conversation,
  OpenConversation,
  TranscriptEntry,
} from '../../conversations/conversations';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import { TicketDrawerShell } from '../ticket-drawer-shell/ticket-drawer-shell';
import {
  ConversationDialogProvider,
  useConversationDialog,
} from './conversation-dialog-provider';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
}));
vi.mock('../../app/conversations/actions', () => ({
  answerConversationPermission: vi.fn(),
  answerConversationQuestion: vi.fn(),
  closeConversation: vi.fn(),
  listOpenConversations: vi.fn(),
  loadConversation: vi.fn(),
  reopenConversation: vi.fn(),
  replyToConversation: vi.fn(),
  startConversation: vi.fn(),
  stopConversation: vi.fn(),
}));
vi.mock('../../app/projects/actions', () => ({
  loadProjectSkills: vi.fn().mockResolvedValue({ ok: true, skills: [] }),
}));

const at = new Date('2026-03-01T09:00:00Z');

const conversation = (values: Partial<Conversation>): Conversation => ({
  id: 1,
  projectId: 3,
  ticketNumber: null,
  intent: 'new_ticket',
  state: 'idle',
  startedBy: 'user',
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

const tab = (values: Partial<Conversation>): OpenConversation => ({
  conversation: conversation(values),
  ticketTitle: values.ticketNumber ? 'Fix the footer' : null,
  projectName: 'Website',
  firstMessage: 'First message',
});

const entry = (conversationId: number, text: string): TranscriptEntry => ({
  id: conversationId,
  conversationId,
  role: 'agent',
  text,
  permission: null,
  permissionRules: null,
  toolName: null,
  toolInput: null,
  question: null,
  createdAt: at,
});

/** Triage of T42 (working), then a New Ticket Conversation (needs you), then an Ask on T7. */
const tabs = [
  tab({ id: 1, ticketNumber: 42, intent: 'triage', state: 'running' }),
  tab({ id: 2, intent: 'new_ticket', state: 'waiting' }),
  tab({ id: 3, ticketNumber: 7, intent: 'ask', state: 'idle' }),
];

let router: ReturnType<typeof mockRouter>;

const at$ = (path: string, search = '') => {
  vi.mocked(usePathname).mockReturnValue(path);
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams(search) as never,
  );
};

/** The dialog's control, for opening a draft while the dialog is modal. */
let opener: ReturnType<typeof useConversationDialog> | undefined;

const Opener: FC = () => {
  const dialog = useConversationDialog();
  opener = dialog;
  return (
    <>
      <button type="button" onClick={() => dialog.open(2)}>
        Open two
      </button>
      <button type="button" onClick={dialog.show}>
        Show
      </button>
      <button
        type="button"
        onClick={() => dialog.openDraft({ intent: 'ask', ticketNumber: 42 })}
      >
        Ask about 42
      </button>
      <button
        type="button"
        onClick={() =>
          dialog.openDraft({
            intent: 'new_ticket',
            projectId: 3,
            text: 'Add coupons',
            defaults: { cycleId: 7, type: 'Ticket' },
          })
        }
      >
        Draft a Ticket
      </button>
      <button
        type="button"
        onClick={() =>
          dialog.reopenAndOpen(conversation({ id: 9, hidden: true }))
        }
      >
        Reopen nine
      </button>
    </>
  );
};

const show = () =>
  renderWithTheme(
    <ConversationDialogProvider>
      <Opener />
    </ConversationDialogProvider>,
  );

/**
 * Shows the dialog at `?conversation=<id>`, and returns how to move the URL
 * to another tab, as the router would after a switch.
 */
const showSwitching = async (id: number) => {
  at$('/project/3', `conversation=${id}`);
  const { rerender } = show();
  await screen.findByRole('dialog', { name: 'Conversations' });
  return (next: number) => {
    at$('/project/3', `conversation=${next}`);
    rerender(
      <ConversationDialogProvider>
        <Opener />
      </ConversationDialogProvider>,
    );
  };
};

const shownPanel = () => screen.getByRole('tabpanel');

/** A question with one choice and several choices, which takes a Submit. */
const pendingQuestion: QuestionEntry = {
  questions: [
    {
      question: 'Which colour?',
      header: 'Colour',
      options: [
        { label: 'Red', description: 'Warm' },
        { label: 'Blue', description: 'Cool' },
      ],
      multiSelect: false,
    },
    {
      question: 'Which sizes?',
      header: 'Sizes',
      options: [
        { label: 'Small', description: 'S' },
        { label: 'Medium', description: 'M' },
      ],
      multiSelect: true,
    },
  ],
  answers: null,
  expired: false,
};

const tabNamed = (name: RegExp | string) => screen.getByRole('tab', { name });

describe('ConversationDialogProvider', () => {
  beforeEach(() => {
    router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
    at$('/project/3');
    vi.mocked(listOpenConversations).mockReset().mockResolvedValue(tabs);
    vi.mocked(loadConversation)
      .mockReset()
      .mockImplementation(async ({ conversationId }) => ({
        ok: true,
        conversation: conversation({ id: conversationId }),
        transcript: [entry(conversationId, `Hello from ${conversationId}`)],
      }));
    vi.mocked(closeConversation).mockReset();
    vi.mocked(startConversation).mockReset();
    vi.mocked(reopenConversation).mockReset();
  });

  it('never opens by itself, even when a Conversation needs the User', async () => {
    show();

    await waitFor(() => expect(listOpenConversations).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens on the tab ?conversation= names, with a tab per open Conversation in the order opened', async () => {
    at$('/project/3', 'conversation=2');
    show();

    const dialog = await screen.findByRole('dialog', { name: 'Conversations' });
    const tablist = within(dialog).getByRole('tablist', {
      name: 'Conversations',
    });
    const names = within(tablist)
      .getAllByRole('tab')
      .map((item) => item.textContent);
    expect(names).toEqual(['T42 · Triage', 'Website · New Ticket', 'T7 · Ask']);
    // Each tab shows its state as an indicator the cards share.
    expect(
      within(tabNamed(/T42/)).getByRole('img', { name: 'Agent running' }),
    ).toBeVisible();
    expect(
      within(tabNamed(/Website · New Ticket/)).getByRole('img', {
        name: 'Needs you',
      }),
    ).toBeVisible();
    expect(
      within(tabNamed(/T7 · Ask/)).getByRole('img', { name: 'Needs you' }),
    ).toBeVisible();
    expect(tabNamed(/Website · New Ticket/)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(tabNamed(/T42/)).toHaveAttribute('aria-selected', 'false');
    const panel = within(dialog).getByRole('tabpanel', {
      name: /Website · New Ticket/,
    });
    expect(await within(panel).findByText('Hello from 2')).toBeInTheDocument();
  });

  it('opens over a Ticket drawer too, and keeps ?ticket= when switching tabs', async () => {
    at$('/project/3', 'ticket=12&conversation=2');
    show();
    await screen.findByRole('dialog', { name: 'Conversations' });

    await userEvent.click(tabNamed(/T42/));

    expect(router.replace).toHaveBeenCalledWith(
      '/project/3?ticket=12&conversation=1',
      { scroll: false },
    );
  });

  it('shows nothing for a ?conversation= that is closed or unknown', async () => {
    at$('/project/3', 'conversation=99');
    show();

    await waitFor(() => expect(listOpenConversations).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves between tabs with the arrow keys, Home and End', async () => {
    at$('/project/3', 'conversation=1');
    show();
    await screen.findByRole('dialog', { name: 'Conversations' });
    expect(tabNamed(/T42/)).toHaveAttribute('tabindex', '0');
    expect(tabNamed(/T7/)).toHaveAttribute('tabindex', '-1');
    tabNamed(/T42/).focus();

    await userEvent.keyboard('{ArrowRight}');
    expect(router.replace).toHaveBeenLastCalledWith(
      '/project/3?conversation=2',
      { scroll: false },
    );

    await userEvent.keyboard('{End}');
    expect(router.replace).toHaveBeenLastCalledWith(
      '/project/3?conversation=3',
      { scroll: false },
    );

    await userEvent.keyboard('{ArrowLeft}');
    expect(router.replace).toHaveBeenLastCalledWith(
      '/project/3?conversation=2',
      { scroll: false },
    );
  });

  it('hides with the X or Escape by removing ?conversation=, and keeps every tab', async () => {
    at$('/project/3', 'ticket=12&conversation=2');
    show();
    const dialog = await screen.findByRole('dialog', { name: 'Conversations' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Hide' }));

    expect(router.replace).toHaveBeenLastCalledWith('/project/3?ticket=12', {
      scroll: false,
    });
    expect(closeConversation).not.toHaveBeenCalled();

    await userEvent.keyboard('{Escape}');

    expect(router.replace).toHaveBeenCalledTimes(2);
    expect(closeConversation).not.toHaveBeenCalled();
  });

  it('leaves the Ticket drawer under it open while the User works in it', async () => {
    at$('/project/3', 'ticket=12&conversation=2');
    vi.mocked(closeConversation).mockResolvedValue({
      ok: true,
      conversation: conversation({ id: 3, hidden: true }),
    });
    const drawerOver = () => (
      <ConversationDialogProvider>
        <TicketDrawerShell number={12} boardPath="/project/3">
          <Opener />
        </TicketDrawerShell>
      </ConversationDialogProvider>
    );
    const { rerender } = renderWithTheme(drawerOver());
    const dialog = await screen.findByRole('dialog', { name: 'Conversations' });
    // Blocks listens for clicks outside an overlay one frame after it opens.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    await userEvent.click(tabNamed(/T42/));
    await userEvent.click(
      screen.getByRole('button', { name: 'Close T7 · Ask' }),
    );
    await userEvent.click(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hide' }));

    expect(router.replace).not.toHaveBeenCalledWith('/project/3', {
      scroll: false,
    });

    // Hidden, the dialog no longer holds the drawer open.
    at$('/project/3', 'ticket=12');
    rerender(drawerOver());
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Conversations' }),
      ).not.toBeInTheDocument(),
    );
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await userEvent.click(document.body);
    expect(router.replace).toHaveBeenLastCalledWith('/project/3', {
      scroll: false,
    });
  });

  it('closes a Conversation from its tab, removes the tab and shows its neighbour', async () => {
    at$('/project/3', 'conversation=2');
    vi.mocked(closeConversation).mockResolvedValue({
      ok: true,
      conversation: conversation({ id: 2, hidden: true }),
    });
    show();
    await screen.findByRole('dialog', { name: 'Conversations' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Close Website · New Ticket' }),
    );

    expect(closeConversation).toHaveBeenCalledExactlyOnceWith({
      conversationId: 2,
    });
    await waitFor(() =>
      expect(screen.queryByRole('tab', { name: /Website/ })).toBeNull(),
    );
    expect(router.replace).toHaveBeenCalledWith('/project/3?conversation=3', {
      scroll: false,
    });
  });

  it('keeps the tab and shows the reason when closing is refused', async () => {
    at$('/project/3', 'conversation=2');
    vi.mocked(closeConversation).mockResolvedValue({
      ok: false,
      error: 'There is no Conversation with id 2.',
    });
    show();
    await screen.findByRole('dialog', { name: 'Conversations' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Close Website · New Ticket' }),
    );

    expect(
      await screen.findByText('There is no Conversation with id 2.'),
    ).toBeInTheDocument();
    expect(tabNamed(/Website/)).toBeInTheDocument();
  });

  it('opens a tab on request, keeping the rest of the URL', async () => {
    at$('/project/3', 'ticket=12');
    show();
    await waitFor(() => expect(listOpenConversations).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Open two' }));

    expect(router.push).toHaveBeenCalledWith(
      '/project/3?ticket=12&conversation=2',
      { scroll: false },
    );
  });

  it('shows the tab it showed last, else the first', async () => {
    show();
    await waitFor(() => expect(listOpenConversations).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(router.push).toHaveBeenLastCalledWith('/project/3?conversation=1', {
      scroll: false,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Open two' }));
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(router.push).toHaveBeenLastCalledWith('/project/3?conversation=2', {
      scroll: false,
    });
  });

  it('reopens a closed Conversation before opening it', async () => {
    vi.mocked(reopenConversation).mockResolvedValue({
      ok: true,
      conversation: conversation({ id: 9 }),
    });
    show();
    await waitFor(() => expect(listOpenConversations).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: 'Reopen nine' }));

    expect(reopenConversation).toHaveBeenCalledWith({ conversationId: 9 });
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/project/3?conversation=9', {
        scroll: false,
      }),
    );
  });

  describe('only the shown tab is mounted (T1100)', () => {
    const replyBox = () =>
      within(shownPanel()).getByRole('textbox', { name: 'Reply' });

    beforeEach(() => {
      vi.mocked(replyToConversation).mockReset();
      vi.mocked(answerConversationQuestion).mockReset();
    });

    it("mounts only the shown tab's chat, and still marks the others", async () => {
      at$('/project/3', 'conversation=2');
      show();

      expect(await screen.findByText('Hello from 2')).toBeInTheDocument();
      expect(screen.queryByText('Hello from 1')).toBeNull();
      expect(screen.queryByText('Hello from 3')).toBeNull();
      expect(loadConversation).not.toHaveBeenCalledWith({ conversationId: 1 });
      expect(screen.getAllByRole('textbox', { name: 'Reply' })).toHaveLength(1);
      expect(
        within(tabNamed(/T42/)).getByRole('img', { name: 'Agent running' }),
      ).toBeInTheDocument();
      expect(
        within(tabNamed(/T7 · Ask/)).getByRole('img', { name: 'Needs you' }),
      ).toBeInTheDocument();
    });

    it('keeps an unsent reply across a switch, and drops it once sent', async () => {
      vi.mocked(replyToConversation).mockResolvedValue({
        ok: true,
        conversation: conversation({ id: 1 }),
      });
      const switchTo = await showSwitching(1);
      await screen.findByText('Hello from 1');
      fireEvent.change(replyBox(), { target: { value: 'Not yet sent' } });

      switchTo(2);
      await screen.findByText('Hello from 2');
      expect(replyBox()).toHaveValue('');
      switchTo(1);
      await screen.findByText('Hello from 1');
      expect(replyBox()).toHaveValue('Not yet sent');

      fireEvent.click(
        within(shownPanel()).getByRole('button', { name: 'Send' }),
      );
      await waitFor(() => expect(replyBox()).toHaveValue(''));
      expect(replyToConversation).toHaveBeenCalledExactlyOnceWith({
        conversationId: 1,
        text: 'Not yet sent',
      });

      switchTo(2);
      await screen.findByText('Hello from 2');
      switchTo(1);
      await screen.findByText('Hello from 1');
      expect(replyBox()).toHaveValue('');
    });

    it('keeps a refused reply and shows the reason, across a switch too', async () => {
      vi.mocked(replyToConversation).mockResolvedValue({
        ok: false,
        error: 'The Agent is still working.',
      });
      const switchTo = await showSwitching(1);
      await screen.findByText('Hello from 1');
      fireEvent.change(replyBox(), { target: { value: 'Try this' } });

      fireEvent.click(
        within(shownPanel()).getByRole('button', { name: 'Send' }),
      );

      expect(
        await screen.findByText('The Agent is still working.'),
      ).toBeInTheDocument();
      expect(replyBox()).toHaveValue('Try this');
      switchTo(2);
      await screen.findByText('Hello from 2');
      switchTo(1);
      await screen.findByText('Hello from 1');
      expect(replyBox()).toHaveValue('Try this');
    });

    it('drops the kept reply when its tab closes', async () => {
      vi.mocked(closeConversation).mockResolvedValue({
        ok: true,
        conversation: conversation({ id: 2, hidden: true }),
      });
      const switchTo = await showSwitching(2);
      await screen.findByText('Hello from 2');
      fireEvent.change(replyBox(), { target: { value: 'Forget me' } });

      fireEvent.click(
        screen.getByRole('button', { name: 'Close Website · New Ticket' }),
      );
      await waitFor(() =>
        expect(screen.queryByRole('tab', { name: /Website/ })).toBeNull(),
      );
      switchTo(3);
      await screen.findByText('Hello from 3');

      // Reopened later, it starts clean.
      act(() => opener?.open(2));
      await screen.findByRole('tab', { name: /Website/ });
      switchTo(2);
      await screen.findByText('Hello from 2');
      expect(replyBox()).toHaveValue('');
    });

    it("keeps a question form's unsent answers across a switch, and drops them once answered", async () => {
      vi.mocked(loadConversation).mockImplementation(
        async ({ conversationId }) => ({
          ok: true,
          conversation: conversation({ id: conversationId }),
          transcript: [
            entry(conversationId, `Hello from ${conversationId}`),
            ...(conversationId === 2
              ? [{ ...entry(20, 'Asked'), question: pendingQuestion }]
              : []),
          ],
        }),
      );
      vi.mocked(answerConversationQuestion)
        .mockResolvedValueOnce({ ok: false, error: 'Not now.' })
        .mockResolvedValue({ ok: true, conversation: conversation({ id: 2 }) });
      const other = () =>
        screen.getByRole('textbox', { name: 'Other answer to Which sizes?' });
      const switchTo = await showSwitching(2);
      await screen.findByText('Which colour?');
      fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Medium' }));
      fireEvent.change(other(), { target: { value: 'Huge' } });

      switchTo(1);
      await screen.findByText('Hello from 1');
      expect(screen.queryByText('Which colour?')).toBeNull();
      switchTo(2);
      await screen.findByText('Which colour?');
      expect(screen.getByRole('radio', { name: 'Blue' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Medium' })).toBeChecked();
      expect(other()).toHaveValue('Huge');

      // A refused submit keeps the answers.
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
      expect(await screen.findByText('Not now.')).toBeInTheDocument();
      switchTo(1);
      await screen.findByText('Hello from 1');
      switchTo(2);
      await screen.findByText('Which colour?');
      expect(screen.getByRole('radio', { name: 'Blue' })).toBeChecked();

      fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
      await waitFor(() =>
        expect(answerConversationQuestion).toHaveBeenLastCalledWith({
          entryId: 20,
          answers: { 'Which colour?': 'Blue', 'Which sizes?': 'Medium, Huge' },
        }),
      );
      // Here the transcript still shows it pending, so a kept answer would show.
      switchTo(1);
      await screen.findByText('Hello from 1');
      switchTo(2);
      await screen.findByText('Which colour?');
      expect(screen.getByRole('radio', { name: 'Blue' })).not.toBeChecked();
      expect(other()).toHaveValue('');
    });

    it("drops a question form's kept answers once the question expires", async () => {
      let question = pendingQuestion;
      vi.mocked(loadConversation).mockImplementation(
        async ({ conversationId }) => ({
          ok: true,
          conversation: conversation({ id: conversationId }),
          transcript: [
            entry(conversationId, `Hello from ${conversationId}`),
            ...(conversationId === 2
              ? [{ ...entry(20, 'Asked'), question }]
              : []),
          ],
        }),
      );
      const switchTo = await showSwitching(2);
      await screen.findByText('Which colour?');
      fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));

      question = { ...pendingQuestion, expired: true };
      switchTo(1);
      await screen.findByText('Hello from 1');
      switchTo(2);
      expect(await screen.findByText('Not answered')).toBeInTheDocument();

      // Even shown as pending again, the answers it had are gone.
      question = pendingQuestion;
      switchTo(1);
      await screen.findByText('Hello from 1');
      switchTo(2);
      expect(
        await screen.findByRole('radio', { name: 'Blue' }),
      ).not.toBeChecked();
    });

    it('shows the last loaded transcript at once on a switch, and loads it again', async () => {
      const switchTo = await showSwitching(1);
      await screen.findByText('Hello from 1');
      switchTo(2);
      await screen.findByText('Hello from 2');
      vi.mocked(loadConversation).mockClear();
      vi.mocked(loadConversation).mockReturnValue(new Promise(() => {}));

      switchTo(1);

      expect(
        within(shownPanel()).getByText('Hello from 1'),
      ).toBeInTheDocument();
      expect(loadConversation).toHaveBeenCalledWith({ conversationId: 1 });
    });

    it('keeps the transcript under the error when a reload fails, until a load succeeds', async () => {
      const loads = vi.mocked(loadConversation).getMockImplementation();
      const switchTo = await showSwitching(1);
      await screen.findByText('Hello from 1');
      switchTo(2);
      await screen.findByText('Hello from 2');
      vi.mocked(loadConversation).mockResolvedValue({
        ok: false,
        error: 'The database is busy.',
      });

      switchTo(1);

      const error = await screen.findByText('The database is busy.');
      const transcript = within(shownPanel()).getByText('Hello from 1');
      expect(
        error.compareDocumentPosition(transcript) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      if (loads) {
        vi.mocked(loadConversation).mockImplementation(loads);
      }
      switchTo(2);
      await screen.findByText('Hello from 2');
      switchTo(1);
      await waitFor(() =>
        expect(screen.queryByText('The database is busy.')).toBeNull(),
      );
      expect(screen.getByText('Hello from 1')).toBeInTheDocument();
    });
  });

  describe('drafts', () => {
    const draftBox = () =>
      screen.getByRole('textbox', { name: /Question|Message/ });

    it('opens an Ask draft tab with an empty input, starting nothing', async () => {
      show();
      await waitFor(() => expect(listOpenConversations).toHaveBeenCalled());

      await userEvent.click(
        screen.getByRole('button', { name: 'Ask about 42' }),
      );

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(tabNamed('Draft · Ask T42')).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(draftBox()).toHaveValue('');
      expect(startConversation).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
    });

    it('opens a New Ticket draft holding the typed title', async () => {
      show();
      await userEvent.click(
        screen.getByRole('button', { name: 'Draft a Ticket' }),
      );

      expect(tabNamed('Draft · New Ticket')).toBeInTheDocument();
      expect(draftBox()).toHaveValue('Add coupons');
      expect(startConversation).not.toHaveBeenCalled();
    });

    it('starts the Conversation on Send, with the defaults, and the draft becomes its tab', async () => {
      const started = conversation({ id: 4, intent: 'new_ticket' });
      vi.mocked(startConversation).mockResolvedValue({
        ok: true,
        conversation: started,
      });
      show();
      await userEvent.click(
        screen.getByRole('button', { name: 'Draft a Ticket' }),
      );
      vi.mocked(listOpenConversations).mockResolvedValue([
        ...tabs,
        tab({ id: 4, intent: 'new_ticket', state: 'running' }),
      ]);

      await userEvent.click(screen.getByRole('button', { name: 'Send' }));

      expect(startConversation).toHaveBeenCalledExactlyOnceWith({
        intent: 'new_ticket',
        prompt: 'Add coupons',
        projectId: 3,
        defaults: { cycleId: 7, type: 'Ticket' },
      });
      await waitFor(() =>
        expect(router.push).toHaveBeenCalledWith('/project/3?conversation=4', {
          scroll: false,
        }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('tab', { name: 'Draft · New Ticket' }),
        ).toBeNull(),
      );
    });

    it('keeps the draft and its text and shows the reason when the start is refused', async () => {
      vi.mocked(startConversation).mockResolvedValue({
        ok: false,
        error: 'This Project already has a Start run working.',
      });
      show();
      await userEvent.click(
        screen.getByRole('button', { name: 'Ask about 42' }),
      );
      await userEvent.type(draftBox(), 'Why?');

      await userEvent.click(screen.getByRole('button', { name: 'Send' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Start run working',
      );
      expect(draftBox()).toHaveValue('Why?');
      expect(tabNamed('Draft · Ask T42')).toBeInTheDocument();
    });

    it('keeps the text when switching tabs, and discards the draft when closed', async () => {
      at$('/project/3', 'conversation=1');
      show();
      await screen.findByRole('dialog');
      // The entry point sits behind the modal dialog here, and a click on it
      // can count as a click outside the dialog, which hides it and drops the
      // draft, depending on pointer state an earlier test left. Open the draft
      // through the dialog's API instead.
      act(() => opener?.openDraft({ intent: 'ask', ticketNumber: 42 }));
      // One change event, not four typed keys: the many pointer and key steps
      // of `userEvent` can outlast the test timeout on a loaded machine.
      fireEvent.change(
        await screen.findByRole('textbox', { name: 'Question' }),
        {
          target: { value: 'Why?' },
        },
      );
      await waitFor(() => {
        expect(router.replace).toHaveBeenCalledWith('/project/3', {
          scroll: false,
        });
      });

      fireEvent.click(tabNamed(/T42 · Triage/));
      await waitFor(() => {
        expect(router.replace).toHaveBeenLastCalledWith(
          '/project/3?conversation=1',
          { scroll: false },
        );
      });
      fireEvent.click(tabNamed('Draft · Ask T42'));
      await waitFor(() => {
        expect(draftBox()).toHaveValue('Why?');
      });

      fireEvent.click(
        screen.getByRole('button', { name: 'Close Draft · Ask T42' }),
      );

      await waitFor(() => {
        expect(
          screen.queryByRole('tab', { name: 'Draft · Ask T42' }),
        ).toBeNull();
      });
      expect(closeConversation).not.toHaveBeenCalled();
      expect(startConversation).not.toHaveBeenCalled();
    });
  });
});
