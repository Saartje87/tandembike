import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import { TicketDrawerSkeleton } from './ticket-drawer-skeleton';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));

describe('TicketDrawerSkeleton', () => {
  it('shows a loading drawer that closes to the Board, keeping its scroll', async () => {
    const router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
    renderWithTheme(<TicketDrawerSkeleton boardPath="/project/1/cycle/7" />);

    const drawer = screen.getByRole('dialog', { name: 'Loading Ticket' });
    expect(within(drawer).getByRole('status')).toHaveAccessibleName('Loading');

    await userEvent.keyboard('{Escape}');

    expect(router.replace).toHaveBeenCalledExactlyOnceWith(
      '/project/1/cycle/7',
      { scroll: false },
    );
  });
});
