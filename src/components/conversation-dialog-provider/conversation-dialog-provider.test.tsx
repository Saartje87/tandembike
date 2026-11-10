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
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  answerConversationWidget,
  closeConversation,
  listOpenConversations,
  loadConversation,
  reopenConversation,
  replyToConversation,
  startConversation,
} from '../../app/conversations/actions';
import type {
  Conversation,
  OpenConversation,
  TranscriptEntry,
} from '../../conversations/conversations';
import type { WidgetEntry } from '../../conversations/widget';
import { aConversation } from '../../test/fixtures';
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
  answerConversationWidget: vi.fn(),
  closeConversation: vi.fn(),
  listOpenConversations: vi.fn(),
  loadConversation: vi.fn(),
  reopenConversation: vi.fn(),
  replyToConversation: vi.fn(),
  startConversation: vi.fn(),
  stopConversation: vi.fn(),
}));
const at = new Date('2026-03-01T09:00:00Z');

const conversation = (values: Partial<Conversation>): Conversation =>
  aConversation({
    projectId: 3,
    intent: 'new_ticket',
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
  widget: null,
  createdAt: at,
  answeredAt: null,
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

/** A multi-select choice Widget waiting on the User. */
const pendingWidget: WidgetEntry = {
  widget: {
    kind: 'choice',
    prompt: 'Which sizes?',
    options: [{ label: 'Small' }, { label: 'Medium' }],
    multiSelect: true,
  },
  answer: null,
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
        footprint: { measured: false },
        transcript: [entry(conversationId, `Hello from ${conversationId}`)],
      }));
    vi.mocked(closeConversation).mockReset();
    vi.mocked(startConversation).mockReset();
    vi.mocked(reopenConversation).mockReset();
  });

  describe('a Spar (GLOSSARY: Spar)', () => {
    const withSpar = [
      ...tabs,
      tab({ id: 12, ticketNumber: 42, intent: 'spar', state: 'waiting' }),
    ];

    it('gets no tab, and opening it opens its own page', async () => {
      vi.mocked(listOpenConversations).mockResolvedValue(withSpar);
      at$('/project/3', 'conversation=2');
      show();
      const dialog = await screen.findByRole('dialog', {
        name: 'Conversations',
      });
      expect(within(dialog).getAllByRole('tab')).toHaveLength(3);

      opener?.open(12);

      expect(router.push).toHaveBeenCalledWith('/project/3/spar/12');
    });

    it('opens its page from reopenAndOpen, without reopening it', async () => {
      show();
      await waitFor(() => expect(listOpenConversations).toHaveBeenCalled());

      await opener?.reopenAndOpen(
        conversation({ id: 12, intent: 'spar', hidden: true }),
      );

      expect(router.push).toHaveBeenCalledWith('/project/3/spar/12');
      expect(reopenConversation).not.toHaveBeenCalled();
    });

    it('turns a ?conversation= naming it into its page', async () => {
      vi.mocked(listOpenConversations).mockResolvedValue(withSpar);
      at$('/project/3', 'conversation=12');
      show();

      await waitFor(() =>
        expect(router.replace).toHaveBeenCalledWith('/project/3/spar/12'),
      );
    });
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

  it('is named Conversations without showing a heading row', async () => {
    at$('/project/3', 'conversation=2');
    show();
    const dialog = await screen.findByRole('dialog', { name: 'Conversations' });

    expect(
      within(dialog).queryByRole('heading', { name: 'Conversations' }),
    ).toBeNull();
  });

  it('hides with Hide in the tab row or Escape by removing ?conversation=, and keeps every tab', async () => {
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

  it('keeps the tab and shows a refusal when closing throws (T1324)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    at$('/project/3', 'conversation=2');
    vi.mocked(closeConversation).mockRejectedValue(new Error('network down'));
    show();
    await screen.findByRole('dialog', { name: 'Conversations' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Close Website · New Ticket' }),
    );

    expect(
      await screen.findByText(
        'The Conversation could not be closed. Try again.',
      ),
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

  it('resolves to a refusal, without opening, when reopening throws (T1324)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    vi.mocked(reopenConversation).mockRejectedValue(new Error('network down'));
    show();
    await waitFor(() => expect(listOpenConversations).toHaveBeenCalled());

    const refusal = await opener?.reopenAndOpen(
      conversation({ id: 9, hidden: true }),
    );

    expect(refusal).toBe('The Conversation could not be reopened. Try again.');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows a refusal in the tab when loading its Conversation throws (T1324)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    vi.mocked(loadConversation).mockRejectedValue(new Error('network down'));
    at$('/project/3', 'conversation=2');
    show();

    expect(
      await within(await screen.findByRole('tabpanel')).findByText(
        'The Conversation could not be loaded. Try again.',
      ),
    ).toBeInTheDocument();
  });

  describe('only the shown tab is mounted (T1100)', () => {
    const replyBox = () =>
      within(shownPanel()).getByRole('textbox', { name: 'Reply' });

    beforeEach(() => {
      vi.mocked(replyToConversation).mockReset();
      vi.mocked(answerConversationWidget).mockReset();
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

    it("keeps a Widget's unsent draft across a switch, and drops it once answered", async () => {
      vi.mocked(loadConversation).mockImplementation(
        async ({ conversationId }) => ({
          ok: true,
          conversation: conversation({ id: conversationId }),
          footprint: { measured: false },
          transcript: [
            entry(conversationId, `Hello from ${conversationId}`),
            ...(conversationId === 2
              ? [
                  {
                    ...entry(20, 'Asked'),
                    conversationId: 2,
                    widget: pendingWidget,
                  },
                ]
              : []),
          ],
        }),
      );
      vi.mocked(answerConversationWidget)
        .mockResolvedValueOnce({ ok: false, error: 'Not now.' })
        .mockResolvedValue({ ok: true, conversation: conversation({ id: 2 }) });
      const switchTo = await showSwitching(2);
      await screen.findByText('Which sizes?');
      fireEvent.click(screen.getByRole('checkbox', { name: 'Medium' }));

      switchTo(1);
      await screen.findByText('Hello from 1');
      expect(screen.queryByText('Which sizes?')).toBeNull();
      switchTo(2);
      await screen.findByText('Which sizes?');
      expect(screen.getByRole('checkbox', { name: 'Medium' })).toBeChecked();

      // A refused send keeps the draft.
      fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
      expect(await screen.findByText('Not now.')).toBeInTheDocument();
      switchTo(1);
      await screen.findByText('Hello from 1');
      switchTo(2);
      await screen.findByText('Which sizes?');
      expect(screen.getByRole('checkbox', { name: 'Medium' })).toBeChecked();

      fireEvent.click(screen.getByRole('button', { name: 'Send answer' }));
      await waitFor(() =>
        expect(answerConversationWidget).toHaveBeenLastCalledWith({
          conversationId: 2,
          entryId: 20,
          answer: { selected: ['Medium'] },
        }),
      );
      // Here the transcript still shows it pending, so a kept draft would show.
      switchTo(1);
      await screen.findByText('Hello from 1');
      switchTo(2);
      await screen.findByText('Which sizes?');
      expect(
        screen.getByRole('checkbox', { name: 'Medium' }),
      ).not.toBeChecked();
    });

    it("drops a Widget's kept draft once it expires", async () => {
      let widget = pendingWidget;
      vi.mocked(loadConversation).mockImplementation(
        async ({ conversationId }) => ({
          ok: true,
          conversation: conversation({ id: conversationId }),
          footprint: { measured: false },
          transcript: [
            entry(conversationId, `Hello from ${conversationId}`),
            ...(conversationId === 2
              ? [{ ...entry(20, 'Asked'), conversationId: 2, widget }]
              : []),
          ],
        }),
      );
      const switchTo = await showSwitching(2);
      await screen.findByText('Which sizes?');
      fireEvent.click(screen.getByRole('checkbox', { name: 'Medium' }));

      widget = { ...pendingWidget, expired: true };
      switchTo(1);
      await screen.findByText('Hello from 1');
      switchTo(2);
      expect(await screen.findByText(/Expired/)).toBeInTheDocument();

      // Even shown as pending again, the draft it had is gone.
      widget = pendingWidget;
      switchTo(1);
      await screen.findByText('Hello from 1');
      switchTo(2);
      expect(
        await screen.findByRole('checkbox', { name: 'Medium' }),
      ).not.toBeChecked();
    });

    it('keeps a transcript whose load resolves after a switch away', async () => {
      let resolveOne: (() => void) | undefined;
      const loads = vi.mocked(loadConversation).getMockImplementation();
      vi.mocked(loadConversation).mockImplementation(async (input) => {
        if (input.conversationId === 1) {
          await new Promise<void>((resolve) => {
            resolveOne = resolve;
          });
        }
        return loads ? loads(input) : { ok: false, error: 'No mock.' };
      });
      const switchTo = await showSwitching(1);
      await waitFor(() => expect(resolveOne).toBeDefined());
      switchTo(2);
      await screen.findByText('Hello from 2');
      await act(async () => resolveOne?.());

      vi.mocked(loadConversation).mockReturnValue(new Promise(() => {}));
      switchTo(1);

      expect(
        within(shownPanel()).getByText('Hello from 1'),
      ).toBeInTheDocument();
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
        error:
          'This Project already has a Start run working: T3 (waiting on you). Answer, stop or close it first, or turn on Parallel runs in the Project settings to allow more.',
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
