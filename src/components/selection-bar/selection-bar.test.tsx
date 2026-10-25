import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { SelectionBar } from './selection-bar';

describe('SelectionBar', () => {
  it('says how many Tickets are selected and clears them', async () => {
    const onClear = vi.fn();
    renderWithTheme(<SelectionBar count={3} onClear={onClear} />);

    expect(
      screen.getByRole('toolbar', { name: 'Selection' }),
    ).toHaveTextContent('3 selected');

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onClear).toHaveBeenCalledOnce();
  });

  it('shows the actions it is given', () => {
    renderWithTheme(
      <SelectionBar count={1} onClear={vi.fn()}>
        <button type="button">Archive</button>
      </SelectionBar>,
    );

    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });
});
