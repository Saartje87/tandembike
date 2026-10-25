import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteTicket } from '../../app/tickets/actions';
import { renderWithTheme } from '../../test/render';
import type { RelatedTicket } from '../../tickets/tickets';
import { DeleteTicketDialog } from './delete-ticket-dialog';

vi.mock('../../app/tickets/actions', () => ({ deleteTicket: vi.fn() }));

const ticket = { number: 42, title: 'Fix the header', claim: null };

const build: RelatedTicket = {
  number: 43,
  title: 'Build the nav',
  status: 'Todo',
  projectId: 1,
  archived: false,
  resolved: false,
};

const openDialog = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
  return screen.getByRole('dialog', { name: 'Delete #42?' });
};

describe('DeleteTicketDialog', () => {
  beforeEach(() => {
    vi.mocked(deleteTicket).mockReset();
  });

  it('asks before deleting, naming the Ticket and that it cannot be undone', async () => {
    renderWithTheme(
      <DeleteTicketDialog ticket={ticket} blocks={[]} epicClaim={null} />,
    );

    const dialog = await openDialog();

    expect(dialog).toHaveAccessibleDescription(
      'Delete #42 "Fix the header" permanently? This can\'t be undone.',
    );
    expect(within(dialog).queryByRole('list')).toBeNull();
  });

  it('names the Tickets it unblocks and the Agent holding a Claim', async () => {
    renderWithTheme(
      <DeleteTicketDialog
        ticket={{
          ...ticket,
          claim: { agentRunId: 'run-1', agentName: 'Claude Code' },
        }}
        blocks={[build]}
        epicClaim={{ agentRunId: 'run-2', agentName: null }}
      />,
    );

    const dialog = await openDialog();

    expect(
      within(dialog)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      '#43 Build the nav will no longer be blocked by it.',
      'Claude Code (run-1) has claimed it.',
      'Agent run run-2 has claimed its Epic.',
    ]);
  });

  it('closes on Cancel without deleting', async () => {
    renderWithTheme(
      <DeleteTicketDialog ticket={ticket} blocks={[]} epicClaim={null} />,
    );
    const dialog = await openDialog();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(deleteTicket).not.toHaveBeenCalled();
  });

  it('deletes on confirm, and shows a refusal in the dialog', async () => {
    vi.mocked(deleteTicket).mockResolvedValue({
      ok: false,
      error: 'Epic #42 still has children. Detach them before deleting it.',
    });
    renderWithTheme(
      <DeleteTicketDialog ticket={ticket} blocks={[]} epicClaim={null} />,
    );
    const dialog = await openDialog();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete #42' }),
    );

    expect(deleteTicket).toHaveBeenCalledWith({ number: 42 });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Epic #42 still has children. Detach them before deleting it.',
    );
  });

  it('tells its owner once the Ticket is deleted', async () => {
    vi.mocked(deleteTicket).mockResolvedValue({ ok: true });
    const onDeleted = vi.fn();
    renderWithTheme(
      <DeleteTicketDialog
        ticket={ticket}
        blocks={[]}
        epicClaim={null}
        onDeleted={onDeleted}
      />,
    );
    const dialog = await openDialog();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Delete #42' }),
    );

    expect(onDeleted).toHaveBeenCalledOnce();
  });
});
