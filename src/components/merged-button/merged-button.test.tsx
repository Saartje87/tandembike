import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { MergedButton } from './merged-button';

const ticket = { number: 7, title: 'Fix the header' };

describe('MergedButton', () => {
  it('names its Ticket and calls back on click', async () => {
    const onMerged = vi.fn();
    renderWithTheme(<MergedButton ticket={ticket} onMerged={onMerged} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Merged T7 Fix the header' }),
    );

    expect(onMerged).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('lists the unchecked criteria and completes only once the User confirms', async () => {
    const onMerged = vi.fn();
    const onCancel = vi.fn();
    renderWithTheme(
      <MergedButton
        ticket={ticket}
        onMerged={onMerged}
        onCancel={onCancel}
        unchecked={[
          { number: 7, text: 'Menu opens' },
          { number: 8, text: 'Logo shows' },
        ]}
      />,
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Merge T7 with unchecked criteria?',
    });
    const list = within(dialog).getByRole('list', {
      name: 'Unchecked criteria',
    });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['T7: Menu opens', 'T8: Logo shows']);
    expect(onMerged).not.toHaveBeenCalled();

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Merged anyway' }),
    );

    expect(onMerged).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('cancels the confirm step without completing', async () => {
    const onMerged = vi.fn();
    const onCancel = vi.fn();
    renderWithTheme(
      <MergedButton
        ticket={ticket}
        onMerged={onMerged}
        onCancel={onCancel}
        unchecked={[{ number: 7, text: 'Menu opens' }]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onMerged).not.toHaveBeenCalled();
  });
});
