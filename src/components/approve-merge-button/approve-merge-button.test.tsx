// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { ApproveMergeButton } from './approve-merge-button';

describe('ApproveMergeButton', () => {
  it('names its Ticket and calls back on click', async () => {
    const onApprove = vi.fn();
    renderWithTheme(
      <ApproveMergeButton
        ticket={{ number: 7, title: 'Fix the header' }}
        onApprove={onApprove}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Approve merge T7 Fix the header' }),
    );

    expect(onApprove).toHaveBeenCalledOnce();
  });

  it('is disabled while pending', () => {
    renderWithTheme(
      <ApproveMergeButton
        ticket={{ number: 7, title: 'Fix the header' }}
        onApprove={vi.fn()}
        pending
      />,
    );

    expect(
      screen.getByRole('button', { name: /Approve merge/ }),
    ).toBeDisabled();
  });
});
