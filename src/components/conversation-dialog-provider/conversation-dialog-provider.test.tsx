import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeConversation,
  listOpenConversations,
  loadConversation,
  reopenConversation,
  startConversation,
} from '../../app/conversations/actions';
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
  closeConversation: vi.fn(),
  listOpenConversations: vi.fn(),
  loadConversation: vi.fn(),
  reopenConversation: vi.fn(),
  replyToConversation: vi.fn(),
  startConversation: vi.fn(),
  stopConversation: vi.fn(),
}));

const at = new Date('2026-03-01T09:00:00Z');

const conversation = (values: Partial<Conversation>): Conversation => ({
  id: 1,
  projectId: 3,
  ticketNumber: null,
  intent: 'new_ticket',
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

const Opener: FC = () => {
  const dialog = useConversationDialog();
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
      // The entry point sits behind the modal dialog here, so click it
      // without the pointer events a backdrop click would hide the dialog with.
      fireEvent.click(screen.getByRole('button', { name: 'Ask about 42' }));
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
