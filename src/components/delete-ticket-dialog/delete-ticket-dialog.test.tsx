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

    expect(deleteTicket).toHaveBeenCalledWith({
      number: 42,
      withChildren: false,
    });
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

  describe('for an Epic with children', () => {
    const epic = { number: 42, title: 'Launch', claim: null };
    const ship: RelatedTicket = { ...build, number: 50, title: 'Ship it' };
    const children = [
      {
        number: 43,
        title: 'Build the nav',
        claim: { agentRunId: 'run-3', agentName: null },
        blocks: [ship],
      },
      { number: 44, title: 'Old idea', claim: null, blocks: [build] },
    ];
    const renderEpic = () =>
      renderWithTheme(
        <DeleteTicketDialog
          ticket={epic}
          blocks={[]}
          epicClaim={null}
          epicChildren={children}
        />,
      );
    const warnings = (dialog: HTMLElement) =>
      within(dialog)
        .queryAllByRole('listitem')
        .map((item) => item.textContent);

    it('offers to delete the children too, unchecked, counting every child', async () => {
      renderEpic();
      const dialog = await openDialog();

      expect(
        within(dialog).getByRole('checkbox', {
          name: 'Also delete its 2 children',
        }),
      ).not.toBeChecked();
      expect(warnings(dialog)).toEqual([]);
    });

    it("warns about the children's Blockers and Claims once checked, leaving out Tickets deleted with them", async () => {
      renderEpic();
      const dialog = await openDialog();

      await userEvent.click(within(dialog).getByRole('checkbox'));

      expect(warnings(dialog)).toEqual([
        '#50 Ship it will no longer be blocked by it.',
        'Agent run run-3 has claimed #43 Build the nav.',
      ]);
    });

    it('deletes the children too only when the box is checked', async () => {
      vi.mocked(deleteTicket).mockResolvedValue({ ok: true });
      renderEpic();
      const dialog = await openDialog();
      const confirm = within(dialog).getByRole('button', {
        name: 'Delete #42',
      });

      await userEvent.click(confirm);
      await userEvent.click(within(dialog).getByRole('checkbox'));
      await userEvent.click(confirm);

      expect(vi.mocked(deleteTicket).mock.calls).toEqual([
        [{ number: 42, withChildren: false }],
        [{ number: 42, withChildren: true }],
      ]);
    });
  });
});
