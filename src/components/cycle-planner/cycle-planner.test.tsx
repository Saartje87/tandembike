import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { planTicket, unplanTicket } from '../../app/cycles/actions';
import { renderWithTheme } from '../../test/render';
import type { Cycle } from '../../tickets/cycles';
import { CyclePlanner } from './cycle-planner';

vi.mock('../../app/cycles/actions', () => ({
  planTicket: vi.fn(),
  unplanTicket: vi.fn(),
}));

const cycle = (
  fields: Pick<Cycle, 'id' | 'title'> & Partial<Cycle>,
): Cycle => ({
  projectId: 3,
  state: 'Prepared',
  ticketNumbers: [],
  createdAt: new Date('2026-01-01'),
  archivedAt: null,
  ...fields,
});

const open = { number: 12, status: 'Todo', archived: false } as const;

describe('CyclePlanner', () => {
  beforeEach(() => {
    vi.mocked(planTicket).mockReset();
    vi.mocked(unplanTicket).mockReset();
  });

  it('plans an open Ticket into a chosen Cycle', async () => {
    vi.mocked(planTicket).mockResolvedValue({ ok: true });
    renderWithTheme(
      <CyclePlanner
        ticket={open}
        cycles={[
          cycle({ id: 7, title: 'Beta' }),
          cycle({ id: 8, title: 'Launch' }),
          cycle({ id: 9, title: 'Old', state: 'Archived' }),
        ]}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Plan into a Cycle' });
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Not planned', 'Beta', 'Launch']);
    await userEvent.selectOptions(select, 'Launch');

    expect(planTicket).toHaveBeenCalledExactlyOnceWith({
      cycleId: 8,
      number: 12,
    });
  });

  it('shows the Cycle a Ticket is planned into, and removes it from there', async () => {
    vi.mocked(unplanTicket).mockResolvedValue({ ok: true });
    renderWithTheme(
      <CyclePlanner
        ticket={open}
        cycles={[
          cycle({
            id: 6,
            title: 'Old',
            state: 'Archived',
            ticketNumbers: [12],
          }),
          cycle({ id: 7, title: 'Beta', ticketNumbers: [12] }),
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: 'Beta' })).toHaveAttribute(
      'href',
      '/project/3/cycle/7',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove from Cycle' }),
    );

    expect(unplanTicket).toHaveBeenCalledExactlyOnceWith({
      cycleId: 7,
      number: 12,
    });
  });

  it('keeps a Done member removable', () => {
    renderWithTheme(
      <CyclePlanner
        ticket={{ ...open, status: 'Done' }}
        cycles={[cycle({ id: 7, title: 'Beta', ticketNumbers: [12] })]}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Remove from Cycle' }),
    ).toBeInTheDocument();
  });

  it('plans a Done Ticket, to record finished work', async () => {
    vi.mocked(planTicket).mockResolvedValue({ ok: true });
    renderWithTheme(
      <CyclePlanner
        ticket={{ ...open, status: 'Done' }}
        cycles={[cycle({ id: 7, title: 'Beta' })]}
      />,
    );

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Plan into a Cycle' }),
      'Beta',
    );

    expect(planTicket).toHaveBeenCalledExactlyOnceWith({
      cycleId: 7,
      number: 12,
    });
  });

  it('does not offer to plan an archived Ticket', () => {
    renderWithTheme(
      <CyclePlanner
        ticket={{ ...open, archived: true }}
        cycles={[cycle({ id: 7, title: 'Beta' })]}
      />,
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(
      screen.getByText('Restore this Ticket to plan it into a Cycle.'),
    ).toBeInTheDocument();
  });

  it('says when the Project has no Cycle to plan into', () => {
    renderWithTheme(<CyclePlanner ticket={open} cycles={[]} />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Not planned')).toBeInTheDocument();
  });

  it('shows why planning was refused', async () => {
    vi.mocked(planTicket).mockResolvedValue({
      ok: false,
      error:
        'Ticket #12 is archived. Restore it before planning it into a Cycle.',
    });
    renderWithTheme(
      <CyclePlanner ticket={open} cycles={[cycle({ id: 7, title: 'Beta' })]} />,
    );

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Plan into a Cycle' }),
      'Beta',
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ticket #12 is archived. Restore it before planning it into a Cycle.',
    );
  });
});
