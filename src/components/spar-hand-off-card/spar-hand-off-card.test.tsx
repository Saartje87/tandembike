import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handOffSpar } from '../../app/spars/actions';
import { renderWithTheme } from '../../test/render';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { SparHandOffCard } from './spar-hand-off-card';

vi.mock('../../app/spars/actions', () => ({ handOffSpar: vi.fn() }));
vi.mock('../conversation-dialog-provider/conversation-dialog-provider', () => ({
  useConversationDialog: vi.fn(),
}));

const open = vi.fn();
const draft = {
  title: 'Cache triage',
  description: 'Decisions: cache it',
  path: 'spec' as const,
};

describe('SparHandOffCard', () => {
  beforeEach(() => {
    vi.mocked(handOffSpar).mockReset();
    open.mockReset();
    vi.mocked(useConversationDialog).mockReturnValue({
      conversations: [],
      open,
      show: vi.fn(),
      reopenAndOpen: vi.fn(),
      openDraft: vi.fn(),
      shown: false,
    });
  });

  it("shows Claude's draft with its recommended path preselected and marked", () => {
    renderWithTheme(<SparHandOffCard sparId={4} draft={draft} />);

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue(
      'Cache triage',
    );
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveValue(
      'Decisions: cache it',
    );
    expect(
      screen.getByRole('radio', { name: 'Spec it (recommended)' }),
    ).toBeChecked();
  });

  it('files the edited draft as a Ticket', async () => {
    vi.mocked(handOffSpar).mockResolvedValue({
      ok: true,
      spar: {} as never,
      ticketNumber: 77,
      conversation: null,
      specError: null,
    });
    renderWithTheme(<SparHandOffCard sparId={4} draft={draft} />);

    const title = screen.getByRole('textbox', { name: 'Title' });
    await userEvent.clear(title);
    await userEvent.type(title, 'Cache it');
    await userEvent.click(
      screen.getByRole('radio', { name: 'File as Ticket' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(handOffSpar).toHaveBeenCalledWith({
      sparId: 4,
      title: 'Cache it',
      description: 'Decisions: cache it',
      path: 'ticket',
    });
    expect(open).not.toHaveBeenCalled();
  });

  it('opens the Spec Conversation after Spec it', async () => {
    vi.mocked(handOffSpar).mockResolvedValue({
      ok: true,
      spar: {} as never,
      ticketNumber: 77,
      conversation: { id: 31 } as never,
      specError: null,
    });
    renderWithTheme(<SparHandOffCard sparId={4} draft={draft} />);

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(open).toHaveBeenCalledWith(31);
  });

  it('shows a refusal under its field', async () => {
    vi.mocked(handOffSpar).mockResolvedValue({
      ok: false,
      error: 'Give the idea Ticket a one-line title.',
      fieldErrors: { title: 'Give the idea Ticket a one-line title.' },
    });
    renderWithTheme(<SparHandOffCard sparId={4} draft={draft} />);

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(
      await screen.findByText('Give the idea Ticket a one-line title.'),
    ).toBeInTheDocument();
  });
});
