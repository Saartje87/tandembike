import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { archiveTicket } from '../../app/tickets/actions';
import { renderWithTheme } from '../../test/render';
import type { RelatedTicket } from '../../tickets/tickets';
import { ArchiveEpicDialog, type ChildArchival } from './archive-epic-dialog';

vi.mock('../../app/tickets/actions', () => ({ archiveTicket: vi.fn() }));

const epic = {
  number: 5,
  title: 'Checkout',
  status: 'In progress' as const,
  claim: null,
};

const blocked = (number: number, title: string): RelatedTicket => ({
  number,
  title,
  status: 'Todo',
  projectId: 1,
  archived: false,
  resolved: false,
});

const child = (
  number: number,
  status: ChildArchival['status'],
  rest: Partial<ChildArchival> = {},
): ChildArchival => ({
  number,
  title: `Pay ${number}`,
  status,
  claim: null,
  blocks: [],
  ...rest,
});

const openDialog = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
  return screen.getByRole('dialog', { name: 'Archive T5 and its children?' });
};

const itemsOf = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent);

describe('ArchiveEpicDialog', () => {
  beforeEach(() => {
    vi.mocked(archiveTicket).mockReset();
  });

  it('lists each child it will archive with its Status, and how many are unfinished', async () => {
    renderWithTheme(
      <ArchiveEpicDialog
        epic={epic}
        blocks={[]}
        epicChildren={[
          child(6, 'Todo'),
          child(7, 'In progress'),
          child(8, 'Done'),
        ]}
      />,
    );

    const dialog = await openDialog();

    expect(dialog).toHaveAccessibleDescription(
      'Archive T5 "Checkout" and its 3 children? 2 of them are not Done. Restoring the Epic brings them back.',
    );
    expect(
      itemsOf(within(dialog).getByRole('list', { name: 'Children' })),
    ).toEqual(['T6 Pay 6 · Todo', 'T7 Pay 7 · In progress', 'T8 Pay 8 · Done']);
    expect(within(dialog).queryByRole('list', { name: 'Warnings' })).toBeNull();
  });

  it('names the Claims and the Tickets that will no longer be blocked', async () => {
    renderWithTheme(
      <ArchiveEpicDialog
        epic={{ ...epic, claim: { agentRunId: 'run-1', agentName: null } }}
        blocks={[blocked(40, 'Launch')]}
        epicChildren={[
          child(6, 'Todo', {
            claim: { agentRunId: 'run-2', agentName: 'Claude Code' },
            blocks: [blocked(41, 'Email receipts'), blocked(7, 'Pay 7')],
          }),
          child(7, 'Todo'),
          child(8, 'Done', { blocks: [blocked(42, 'Refunds')] }),
        ]}
      />,
    );

    const dialog = await openDialog();

    expect(
      itemsOf(within(dialog).getByRole('list', { name: 'Warnings' })),
    ).toEqual([
      'T40 Launch will no longer be blocked by T5.',
      'T41 Email receipts will no longer be blocked by T6.',
      'Agent run run-1 has claimed it.',
      'Claude Code (run-2) has claimed T6 Pay 6.',
    ]);
  });

  it('closes on Cancel without archiving', async () => {
    renderWithTheme(
      <ArchiveEpicDialog
        epic={epic}
        blocks={[]}
        epicChildren={[child(6, 'Todo')]}
      />,
    );
    const dialog = await openDialog();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(archiveTicket).not.toHaveBeenCalled();
  });

  it('archives the Epic with its children on confirm, and shows a refusal in the dialog', async () => {
    vi.mocked(archiveTicket).mockResolvedValue({
      ok: false,
      error: 'Project Website is archived.',
    });
    renderWithTheme(
      <ArchiveEpicDialog
        epic={epic}
        blocks={[]}
        epicChildren={[child(6, 'Todo')]}
      />,
    );
    const dialog = await openDialog();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Archive T5' }),
    );

    expect(archiveTicket).toHaveBeenCalledWith({
      number: 5,
      withChildren: true,
    });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Project Website is archived.',
    );
  });

  it('closes once archived', async () => {
    vi.mocked(archiveTicket).mockResolvedValue({ ok: true });
    renderWithTheme(
      <ArchiveEpicDialog
        epic={epic}
        blocks={[]}
        epicChildren={[child(6, 'Todo')]}
      />,
    );
    const dialog = await openDialog();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Archive T5' }),
    );

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
