import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { discardCycle, renameCycle } from '../../app/cycles/actions';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import type { Cycle } from '../../tickets/cycles';
import { CycleHeader } from './cycle-header';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../../app/cycles/actions', () => ({
  discardCycle: vi.fn(),
  renameCycle: vi.fn(),
}));

const prepared: Cycle = {
  id: 7,
  projectId: 3,
  title: 'Launch the beta',
  state: 'Prepared',
  ticketNumbers: [],
  createdAt: new Date('2026-01-01'),
};

describe('CycleHeader', () => {
  let router: ReturnType<typeof mockRouter>;

  beforeEach(() => {
    router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
    vi.mocked(renameCycle).mockReset();
    vi.mocked(discardCycle).mockReset();
    vi.restoreAllMocks();
  });

  it("shows the Cycle's title and state", () => {
    renderWithTheme(<CycleHeader cycle={prepared} />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Launch the beta' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Prepared')).toBeInTheDocument();
  });

  it('renames the Cycle inline', async () => {
    vi.mocked(renameCycle).mockResolvedValue({ ok: true });
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Cycle title' });
    expect(input).toHaveValue('Launch the beta');
    await userEvent.clear(input);
    await userEvent.type(input, 'Public beta{Enter}');

    expect(renameCycle).toHaveBeenCalledExactlyOnceWith({
      cycleId: 7,
      title: 'Public beta',
    });
    expect(
      await screen.findByRole('button', { name: 'Rename' }),
    ).toBeInTheDocument();
  });

  it('keeps the editor open with the reason a rename was refused', async () => {
    vi.mocked(renameCycle).mockResolvedValue({
      ok: false,
      error: 'Enter a title.',
      fieldErrors: { title: 'Enter a title.' },
    });
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByRole('textbox', { name: 'Cycle title' });
    await userEvent.clear(input);
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByText('Enter a title.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('cancels a rename with Escape', async () => {
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Cycle title' }),
      'x{Escape}',
    );

    expect(renameCycle).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Launch the beta' }),
    ).toBeInTheDocument();
  });

  it('discards a Prepared Cycle after confirming, and goes to the Backlog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(discardCycle).mockResolvedValue({ ok: true });
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Discard Cycle' }),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      'Discard the Cycle "Launch the beta"? Its Tickets go back to the Backlog.',
    );
    expect(discardCycle).toHaveBeenCalledWith({ cycleId: 7 });
    expect(router.push).toHaveBeenCalledWith('/project/3');
  });

  it('keeps the Cycle when the User declines to discard it', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Discard Cycle' }),
    );

    expect(discardCycle).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows why discarding was refused', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(discardCycle).mockResolvedValue({
      ok: false,
      error: 'There is no Cycle with id 7.',
    });
    renderWithTheme(<CycleHeader cycle={prepared} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Discard Cycle' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no Cycle with id 7.',
    );
    expect(router.push).not.toHaveBeenCalled();
  });
});
