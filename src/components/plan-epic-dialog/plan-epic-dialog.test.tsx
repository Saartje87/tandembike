import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { planTicket } from '../../app/cycles/actions';
import { renderWithTheme } from '../../test/render';
import { PlanEpicDialog } from './plan-epic-dialog';

vi.mock('../../app/cycles/actions', () => ({ planTicket: vi.fn() }));

const epic = { number: 5, title: 'Checkout' };
const cycle = { id: 8, title: 'Launch' };
const children = [
  { number: 6, title: 'Pay', status: 'Todo' as const, leaves: null },
  { number: 7, title: 'Ship', status: 'Done' as const, leaves: 'Beta' },
];

const renderDialog = (onClose = vi.fn()) => {
  renderWithTheme(
    <PlanEpicDialog
      epic={epic}
      cycle={cycle}
      epicChildren={children}
      onClose={onClose}
    />,
  );
  return {
    onClose,
    dialog: screen.getByRole('dialog', {
      name: 'Plan T5 into Launch?',
    }),
  };
};

describe('PlanEpicDialog', () => {
  beforeEach(() => {
    vi.mocked(planTicket).mockReset();
  });

  it('lists each child with its Status and the Cycle it would leave', () => {
    const { dialog } = renderDialog();

    expect(dialog).toHaveAccessibleDescription(
      'Plan T5 "Checkout" into the Cycle "Launch" with its 2 children, or on its own?',
    );
    expect(
      within(within(dialog).getByRole('list', { name: 'Children' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['T6 Pay · Todo', 'T7 Ship · Done · leaves "Beta"']);
  });

  it('plans the Epic and its children', async () => {
    vi.mocked(planTicket).mockResolvedValue({ ok: true });
    const { dialog, onClose } = renderDialog();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Epic and 2 children' }),
    );

    expect(planTicket).toHaveBeenCalledExactlyOnceWith({
      cycleId: 8,
      number: 5,
      withChildren: true,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('plans only the Epic', async () => {
    vi.mocked(planTicket).mockResolvedValue({ ok: true });
    const { dialog, onClose } = renderDialog();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Only the Epic' }),
    );

    expect(planTicket).toHaveBeenCalledExactlyOnceWith({
      cycleId: 8,
      number: 5,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('changes nothing on Cancel', async () => {
    const { dialog, onClose } = renderDialog();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );

    expect(planTicket).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a refusal in the dialog and stays open', async () => {
    vi.mocked(planTicket).mockResolvedValue({ ok: false, error: 'No way.' });
    const { dialog, onClose } = renderDialog();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Epic and 2 children' }),
    );

    await waitFor(() =>
      expect(within(dialog).getByRole('alert').textContent).toBe('No way.'),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
