import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import type { CycleState } from '../../tickets/cycle-state';
import type { Cycle } from '../../tickets/cycles';
import { MoveToCycleMenu } from './move-to-cycle-menu';

showOpenPopovers();

const cycle = (
  id: number,
  title: string,
  state: CycleState = 'Prepared',
): Cycle => ({
  id,
  projectId: 1,
  title,
  state,
  ticketNumbers: [],
  createdAt: new Date('2026-01-01'),
  archivedAt: state === 'Archived' ? new Date('2026-02-01') : null,
});
const old = cycle(1, 'Old', 'Archived');
const launch = cycle(2, 'Launch');
const beta = cycle(3, 'Beta');
const current = cycle(4, 'Current', 'Active');
const cycles = [old, launch, beta, current];

const trigger = () => screen.getByRole('button', { name: 'Move to Cycle' });
const menu = () => screen.queryByRole('menu');

/** The targets the open menu offers, in order. */
const targets = () =>
  within(screen.getByRole('menu'))
    .getAllByRole('menuitem')
    .map((item) => item.textContent);

describe('MoveToCycleMenu', () => {
  it('on the Backlog offers the open Cycles, Active first, and no Backlog', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <MoveToCycleMenu cycles={cycles} cycleId={null} onPick={vi.fn()} />,
    );

    await user.click(trigger());

    expect(targets()).toEqual(['Current', 'Launch', 'Beta']);
  });

  it("on a Cycle's Board offers the other open Cycles, then the Backlog last", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <MoveToCycleMenu cycles={cycles} cycleId={launch.id} onPick={vi.fn()} />,
    );

    await user.click(trigger());

    expect(targets()).toEqual(['Current', 'Beta', 'Backlog']);
  });

  it("shows on a Cycle's Board with no other open Cycle, and hides on the Backlog without one", () => {
    const { rerender } = renderWithTheme(
      <MoveToCycleMenu
        cycles={[old, launch]}
        cycleId={launch.id}
        onPick={vi.fn()}
      />,
    );

    expect(trigger()).toBeInTheDocument();

    rerender(
      <MoveToCycleMenu cycles={[old]} cycleId={null} onPick={vi.fn()} />,
    );

    expect(
      screen.queryByRole('button', { name: 'Move to Cycle' }),
    ).not.toBeInTheDocument();
  });

  it('picks a Cycle, or null for the Backlog, and closes', async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    renderWithTheme(
      <MoveToCycleMenu cycles={cycles} cycleId={launch.id} onPick={onPick} />,
    );

    await user.click(trigger());

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('menuitem', { name: 'Beta' }));

    expect(onPick).toHaveBeenLastCalledWith(beta.id);
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(menu()).not.toBeInTheDocument();

    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name: 'Backlog' }));

    expect(onPick).toHaveBeenLastCalledWith(null);
  });

  it('closes on Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <MoveToCycleMenu cycles={[launch]} cycleId={null} onPick={vi.fn()} />,
    );
    await user.click(trigger());

    expect(menu()).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(menu()).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('claims Escape from what holds it, such as a drawer, and closes', async () => {
    const claimed = vi.fn();
    const user = userEvent.setup();
    renderWithTheme(
      // biome-ignore lint/a11y/noStaticElementInteractions: it only records the Escape.
      <div onKeyDown={(event) => claimed(event.defaultPrevented)}>
        <MoveToCycleMenu cycles={[launch]} cycleId={null} onPick={vi.fn()} />
      </div>,
    );
    await user.click(trigger());

    await user.keyboard('{Escape}');

    expect(menu()).not.toBeInTheDocument();
    expect(claimed.mock.calls).toEqual([[true]]);
  });

  it('cannot open while disabled', () => {
    renderWithTheme(
      <MoveToCycleMenu
        cycles={[launch]}
        cycleId={null}
        disabled
        onPick={vi.fn()}
      />,
    );

    expect(trigger()).toBeDisabled();
  });
});
