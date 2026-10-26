import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import type { Cycle } from '../../tickets/cycles';
import { PlanIntoCycleMenu } from './plan-into-cycle-menu';

showOpenPopovers();

const cycle = (id: number, title: string): Cycle => ({
  id,
  projectId: 1,
  title,
  state: 'Prepared',
  ticketNumbers: [],
  createdAt: new Date('2026-01-01'),
  archivedAt: null,
});
const launch = cycle(2, 'Launch');
const beta = cycle(3, 'Beta');

const menu = () => screen.queryByRole('dialog', { name: 'Plan into Cycle' });

describe('PlanIntoCycleMenu', () => {
  it('lists the Cycles and closes on a pick', async () => {
    const onPick = vi.fn();
    const user = userEvent.setup();
    renderWithTheme(
      <PlanIntoCycleMenu cycles={[launch, beta]} onPick={onPick} />,
    );
    const trigger = screen.getByRole('button', { name: 'Plan into Cycle' });

    expect(menu()).not.toBeInTheDocument();

    await user.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await user.click(screen.getByRole('button', { name: 'Beta' }));

    expect(onPick).toHaveBeenCalledExactlyOnceWith(beta);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(menu()).not.toBeInTheDocument();
  });

  it('closes on Escape and keeps the Escape from what holds it', async () => {
    const onKeyDown = vi.fn();
    const user = userEvent.setup();
    renderWithTheme(
      // biome-ignore lint/a11y/noStaticElementInteractions: it only records the Escape.
      <div onKeyDown={onKeyDown}>
        <PlanIntoCycleMenu cycles={[launch]} onPick={vi.fn()} />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Plan into Cycle' }));

    await user.keyboard('{Escape}');

    expect(menu()).not.toBeInTheDocument();
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('cannot open while disabled', () => {
    renderWithTheme(
      <PlanIntoCycleMenu cycles={[launch]} disabled onPick={vi.fn()} />,
    );

    expect(
      screen.getByRole('button', { name: 'Plan into Cycle' }),
    ).toBeDisabled();
  });
});
