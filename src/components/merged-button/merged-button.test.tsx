import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { MergedButton } from './merged-button';

describe('MergedButton', () => {
  it('names its Ticket and calls back on click', async () => {
    const onMerged = vi.fn();
    renderWithTheme(
      <MergedButton
        ticket={{ number: 7, title: 'Fix the header' }}
        onMerged={onMerged}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Merged T7 Fix the header' }),
    );

    expect(onMerged).toHaveBeenCalledOnce();
  });
});
