import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type {
  Conversation,
  OpenConversation,
} from '../../conversations/conversations';
import { renderWithTheme } from '../../test/render';
import {
  ConversationTabs,
  type ConversationTabsProps,
} from './conversation-tabs';

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

/** Triage of T42 (working), then a New Ticket Conversation (needs you), then an Ask on T7. */
const tabs = [
  tab({ id: 1, ticketNumber: 42, intent: 'triage', state: 'running' }),
  tab({ id: 2, intent: 'new_ticket', state: 'waiting' }),
  tab({ id: 3, ticketNumber: 7, intent: 'ask', state: 'idle' }),
];

const setup = (props: Partial<ConversationTabsProps> = {}) => {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const drafts = {
    items: [{ key: 'draft-a', label: 'Draft · Ask T42' }],
    selectedKey: undefined as string | undefined,
    onSelect: vi.fn(),
    onClose: vi.fn(),
  };
  renderWithTheme(
    <ConversationTabs
      tabs={tabs}
      selectedId={2}
      onSelect={onSelect}
      onClose={onClose}
      drafts={drafts}
      renderConversation={(open) => <p>Chat {open.conversation.id}</p>}
      renderDraft={(key) => <p>Draft {key}</p>}
      {...props}
    />,
  );
  return { onSelect, onClose, drafts };
};

const tabNamed = (name: RegExp | string) => screen.getByRole('tab', { name });

describe('ConversationTabs', () => {
  it('shows a tab per Conversation then per draft, the selected one selected', () => {
    setup();

    expect(screen.getAllByRole('tab').map((item) => item.textContent)).toEqual([
      'T42 · Triage',
      'Website · New Ticket',
      'T7 · Ask',
      'Draft · Ask T42',
    ]);
    expect(tabNamed(/Website · New Ticket/)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(tabNamed(/^T42/)).toHaveAttribute('aria-selected', 'false');
  });

  it('follows the selected draft when no Conversation is selected', () => {
    setup({
      selectedId: undefined,
      drafts: {
        items: [{ key: 'draft-a', label: 'Draft · Ask T42' }],
        selectedKey: 'draft-a',
        onSelect: vi.fn(),
        onClose: vi.fn(),
      },
    });

    expect(tabNamed('Draft · Ask T42')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('shows the running and needs-you markers', () => {
    setup();

    expect(
      within(tabNamed(/^T42/)).getByRole('img', { name: 'Agent running' }),
    ).toBeInTheDocument();
    expect(
      within(tabNamed(/Website/)).getByRole('img', { name: 'Needs you' }),
    ).toBeInTheDocument();
  });

  it('keeps only the selected tab in the Tab order', () => {
    setup();

    expect(tabNamed(/Website/)).toHaveAttribute('tabindex', '0');
    expect(tabNamed(/^T42/)).toHaveAttribute('tabindex', '-1');
    expect(tabNamed(/T7/)).toHaveAttribute('tabindex', '-1');
  });

  it('selects another tab with the arrow keys, Home and End', async () => {
    const { onSelect, drafts } = setup();
    const user = userEvent.setup();
    tabNamed(/Website/).focus();

    await user.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenLastCalledWith(3);
    tabNamed(/Website/).focus();
    await user.keyboard('{ArrowLeft}');
    expect(onSelect).toHaveBeenLastCalledWith(1);
    tabNamed(/Website/).focus();
    await user.keyboard('{Home}');
    expect(onSelect).toHaveBeenLastCalledWith(1);
    tabNamed(/Website/).focus();
    await user.keyboard('{End}');
    expect(drafts.onSelect).toHaveBeenLastCalledWith('draft-a');
  });

  it('selects a tab on click, a draft by its key', async () => {
    const { onSelect, drafts } = setup();

    await userEvent.click(tabNamed(/T7/));
    expect(onSelect).toHaveBeenCalledWith(3);
    await userEvent.click(tabNamed('Draft · Ask T42'));
    expect(drafts.onSelect).toHaveBeenCalledWith('draft-a');
  });

  it('closes a Conversation by its id and a draft by its key', async () => {
    const { onClose, drafts } = setup();

    await userEvent.click(
      screen.getByRole('button', { name: 'Close T42 · Triage' }),
    );
    expect(onClose).toHaveBeenCalledWith(1);
    await userEvent.click(
      screen.getByRole('button', { name: 'Close Draft · Ask T42' }),
    );
    expect(drafts.onClose).toHaveBeenCalledWith('draft-a');
  });

  it('labels each panel by its tab and keeps the panels that are not selected mounted', () => {
    setup();

    const panel = screen.getByRole('tabpanel', {
      name: /Website · New Ticket/,
    });
    expect(within(panel).getByText('Chat 2')).toBeVisible();
    const hidden = screen
      .getAllByRole('tabpanel', { hidden: true })
      .find((item) => item.hidden && item.textContent === 'Chat 1');
    expect(hidden).toHaveAttribute('aria-labelledby', tabNamed(/^T42/).id);
    expect(hidden).not.toBeVisible();
    expect(screen.getByText('Draft draft-a')).toBeInTheDocument();
  });
});
