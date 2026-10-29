import { Dialog } from '@blockle/blocks';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { Activity, type FC, use } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import { TicketDrawerShell, useTicketDrawer } from './ticket-drawer-shell';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));

/** A body still streaming in: it suspends for good. */
const Loading: FC = () => {
  use(new Promise(() => {}));
  return null;
};

type LoadedProps = { title: string };

/** A loaded body, its title heading naming the drawer. */
const Loaded: FC<LoadedProps> = ({ title }) => {
  const { titleId } = useTicketDrawer();
  return <h2 id={titleId}>{title}</h2>;
};

const drawer = () => screen.getByRole('dialog');
const spinner = () => within(drawer()).getByRole('status', { name: 'Loading' });

describe('TicketDrawerShell', () => {
  let router: ReturnType<typeof mockRouter>;

  beforeEach(() => {
    router = mockRouter();
    vi.mocked(useRouter).mockReturnValue(router);
  });

  it('shows the number, Close and a spinner while the Ticket loads', () => {
    renderWithTheme(
      <TicketDrawerShell number={4} boardPath="/project/1">
        <Loading />
      </TicketDrawerShell>,
    );

    expect(screen.getByRole('dialog', { name: 'Ticket T4' })).toHaveAttribute(
      'open',
    );
    expect(
      within(drawer()).getByRole('button', { name: 'Copy Ticket number T4' }),
    ).toBeInTheDocument();
    expect(spinner()).toBeInTheDocument();
  });

  it('closes to its Board while loading, keeping its scroll', async () => {
    renderWithTheme(
      <TicketDrawerShell number={4} boardPath="/project/1/cycle/7">
        <Loading />
      </TicketDrawerShell>,
    );

    await userEvent.click(
      within(drawer()).getByRole('button', { name: 'Close' }),
    );
    await userEvent.keyboard('{Escape}');

    expect(router.replace).toHaveBeenCalledTimes(2);
    expect(router.replace).toHaveBeenCalledWith('/project/1/cycle/7', {
      scroll: false,
    });
  });

  it("is named after the Ticket's title once it loads", () => {
    renderWithTheme(
      <TicketDrawerShell number={4} boardPath="/project/1">
        <Loaded title="Fix the header" />
      </TicketDrawerShell>,
    );

    expect(
      screen.getByRole('dialog', { name: 'Fix the header' }),
    ).toBeInTheDocument();
    expect(
      within(drawer()).queryByRole('status', { name: 'Loading' }),
    ).not.toBeInTheDocument();
  });

  it('keeps its dialog when switching Tickets, replacing only the contents', async () => {
    const { rerender } = renderWithTheme(
      <TicketDrawerShell number={4} boardPath="/project/1">
        <Loaded title="Fix the header" />
      </TicketDrawerShell>,
    );
    const first = drawer();

    rerender(
      <TicketDrawerShell number={5} boardPath="/project/1">
        <Loading />
      </TicketDrawerShell>,
    );
    expect(screen.getByRole('dialog', { name: 'Ticket T5' })).toBe(first);
    expect(
      within(first).getByRole('status', { name: 'Loading' }),
    ).toBeInTheDocument();
    expect(
      within(first).getByRole('button', { name: 'Copy Ticket number T5' }),
    ).toBeInTheDocument();

    rerender(
      <TicketDrawerShell number={5} boardPath="/project/1">
        <Loaded title="Fix the footer" />
      </TicketDrawerShell>,
    );
    // Found, not got: React holds back a reveal just after a fallback.
    expect(await screen.findByRole('dialog', { name: 'Fix the footer' })).toBe(
      first,
    );
  });

  it('leaves an Escape to a dialog open inside it', async () => {
    const closeDelete = vi.fn();
    const withDelete = (open: boolean) => (
      <TicketDrawerShell number={4} boardPath="/project/1">
        <Dialog open={open} onRequestClose={closeDelete} aria-label="Delete T4">
          <button type="button">Cancel</button>
        </Dialog>
      </TicketDrawerShell>
    );
    const { rerender } = renderWithTheme(withDelete(false));
    rerender(withDelete(true));

    await userEvent.keyboard('{Escape}');

    expect(closeDelete).toHaveBeenCalledWith('escape');
    expect(router.replace).not.toHaveBeenCalled();
  });

  // Next.js keeps a route the User left in a hidden <Activity>, and shows it
  // again when they come back.
  it('closes its dialog while its route is hidden and reopens it', () => {
    const at = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <TicketDrawerShell number={4} boardPath="/project/1">
          <Loaded title="Fix the header" />
        </TicketDrawerShell>
      </Activity>
    );
    const { rerender } = renderWithTheme(at('visible'));

    rerender(at('hidden'));
    expect(document.querySelector('dialog')).not.toHaveAttribute('open');

    rerender(at('visible'));
    expect(drawer()).toHaveAttribute('open');
  });
});
