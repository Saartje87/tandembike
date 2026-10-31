import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FC } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeConversation,
  listOpenConversations,
  loadConversation,
  reopenConversation,
} from '../../app/conversations/actions';
import type {
  Conversation,
  OpenConversation,
  TranscriptEntry,
} from '../../conversations/conversations';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
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
    expect(
      within(tablist)
        .getAllByRole('tab')
        .map((item) => item.textContent),
    ).toEqual([
      'T42 · Triage · working',
      'Website · New Ticket · needs you',
      'T7 · Ask · needs you',
    ]);
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
});
