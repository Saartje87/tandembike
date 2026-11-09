import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { closeSpar, reopenSpar } from '../../app/spars/actions';
import { renderWithTheme } from '../../test/render';
import { SparCloseButton } from './spar-close-button';

vi.mock('../../app/spars/actions', () => ({
  closeSpar: vi.fn(),
  reopenSpar: vi.fn(),
}));

describe('SparCloseButton', () => {
  beforeEach(() => {
    vi.mocked(closeSpar)
      .mockReset()
      .mockResolvedValue({ ok: true } as never);
    vi.mocked(reopenSpar)
      .mockReset()
      .mockResolvedValue({ ok: true } as never);
  });

  it('closes an open Spar', async () => {
    renderWithTheme(
      <SparCloseButton sparId={2} closed={false} closing={false} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(closeSpar).toHaveBeenCalledWith({ sparId: 2 });
  });

  it('shows a closing Spar as closing, and reopens a closed one', async () => {
    const { rerender } = renderWithTheme(
      <SparCloseButton sparId={2} closed={false} closing />,
    );
    expect(screen.getByRole('button', { name: 'Closing…' })).toBeDisabled();

    rerender(<SparCloseButton sparId={2} closed closing={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }));

    expect(reopenSpar).toHaveBeenCalledWith({ sparId: 2 });
  });

  it('shows a refusal', async () => {
    vi.mocked(closeSpar).mockResolvedValue({ ok: false, error: 'No.' });
    renderWithTheme(
      <SparCloseButton sparId={2} closed={false} closing={false} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(await screen.findByText('No.')).toBeInTheDocument();
  });
});
