// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import { AddToEpicMenu } from './add-to-epic-menu';

showOpenPopovers();

describe('AddToEpicMenu', () => {
  it('offers each Epic and calls back with the one picked', async () => {
    const onPick = vi.fn();
    renderWithTheme(
      <AddToEpicMenu
        epics={[
          { number: 4, title: 'Alpha' },
          { number: 9, title: 'Beta' },
        ]}
        onPick={onPick}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add to Epic' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'T9 Beta' }));

    expect(onPick).toHaveBeenCalledExactlyOnceWith(9);
  });

  it('is left out without Epics', () => {
    renderWithTheme(<AddToEpicMenu epics={[]} onPick={vi.fn()} />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
