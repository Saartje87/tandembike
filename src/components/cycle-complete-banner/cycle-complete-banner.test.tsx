import { act, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { archiveCycle } from '../../app/cycles/actions';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import { CycleCompleteBanner } from './cycle-complete-banner';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../../app/cycles/actions', () => ({ archiveCycle: vi.fn() }));

const cycle = { id: 7, projectId: 3, title: 'Launch the beta' };

describe('CycleCompleteBanner', () => {
  let router: ReturnType<typeof mockRouter>;

  beforeEach(() => {
    router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
    vi.mocked(archiveCycle).mockReset();
    vi.restoreAllMocks();
  });

  it('says the Cycle is complete', () => {
    renderWithTheme(<CycleCompleteBanner cycle={cycle} />);

    expect(screen.getByText(/Launch the beta.*complete/)).toBeInTheDocument();
  });

  it('archives after confirmation and goes to the Backlog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(archiveCycle).mockResolvedValue({ ok: true });
    renderWithTheme(<CycleCompleteBanner cycle={cycle} />);

    await act(() =>
      userEvent.click(screen.getByRole('button', { name: 'Archive Cycle' })),
    );

    expect(window.confirm).toHaveBeenCalledWith(
      'Archive the Cycle "Launch the beta"? Its unfinished Tickets go back to the Backlog.',
    );
    expect(archiveCycle).toHaveBeenCalledWith({ cycleId: 7 });
    expect(router.push).toHaveBeenCalledWith('/project/3');
  });

  it('archives nothing when the User declines', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithTheme(<CycleCompleteBanner cycle={cycle} />);

    await act(() =>
      userEvent.click(screen.getByRole('button', { name: 'Archive Cycle' })),
    );

    expect(archiveCycle).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows a refusal and stays', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(archiveCycle).mockResolvedValue({
      ok: false,
      error: 'Not allowed.',
    });
    renderWithTheme(<CycleCompleteBanner cycle={cycle} />);

    await act(() =>
      userEvent.click(screen.getByRole('button', { name: 'Archive Cycle' })),
    );

    expect(screen.getByText('Not allowed.')).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});
