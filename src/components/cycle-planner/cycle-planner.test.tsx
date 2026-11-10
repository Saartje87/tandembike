import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { planTicket, unplanTicket } from '../../app/cycles/actions';
import { anEpicChild } from '../../test/fixtures';
import { renderWithTheme } from '../../test/render';
import type { Cycle } from '../../tickets/cycles';
import type { EpicChild } from '../../tickets/tickets';
import { CyclePlanner, type CyclePlannerProps } from './cycle-planner';

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

const open: CyclePlannerProps['ticket'] = {
  number: 12,
  title: 'Checkout',
  status: 'Todo',
  archived: false,
  type: 'Ticket',
  children: [],
};

const epicChild = (
  number: number,
  fields: Partial<EpicChild> = {},
): EpicChild => anEpicChild({ number, title: `Pay ${number}`, ...fields });

const epic = (children: EpicChild[]): CyclePlannerProps['ticket'] => ({
  ...open,
  type: 'Epic',
  children,
});

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
        'Ticket T12 is archived. Restore it before planning it into a Cycle.',
    });
    renderWithTheme(
      <CyclePlanner ticket={open} cycles={[cycle({ id: 7, title: 'Beta' })]} />,
    );

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Plan into a Cycle' }),
      'Beta',
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ticket T12 is archived. Restore it before planning it into a Cycle.',
    );
  });

  it('shows a planning action that throws as a refusal (T1323)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    vi.mocked(planTicket).mockRejectedValue(new Error('network down'));
    renderWithTheme(
      <CyclePlanner ticket={open} cycles={[cycle({ id: 7, title: 'Beta' })]} />,
    );

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Plan into a Cycle' }),
      'Beta',
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Ticket could not be planned. Try again.',
    );
    await waitFor(() =>
      expect(
        screen.getByRole('combobox', { name: 'Plan into a Cycle' }),
      ).toBeEnabled(),
    );
  });

  it('shows a removing action that throws as a refusal (T1323)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    vi.mocked(unplanTicket).mockRejectedValue(new Error('network down'));
    renderWithTheme(
      <CyclePlanner
        ticket={open}
        cycles={[cycle({ id: 7, title: 'Beta', ticketNumbers: [12] })]}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove from Cycle' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Ticket could not be taken out of the Cycle. Try again.',
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Remove from Cycle' }),
      ).toBeEnabled(),
    );
  });

  describe('planning an Epic', () => {
    const pick = async (
      ticket: Parameters<typeof CyclePlanner>[0]['ticket'],
      cycles: Cycle[],
    ) => {
      renderWithTheme(<CyclePlanner ticket={ticket} cycles={cycles} />);
      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: 'Plan into a Cycle' }),
        'Launch',
      );
    };
    const cycles = [
      cycle({ id: 7, title: 'Beta', ticketNumbers: [14] }),
      cycle({ id: 8, title: 'Launch', ticketNumbers: [15] }),
    ];

    it('asks first, listing the children not in the Cycle and where they would leave', async () => {
      await pick(
        epic([
          epicChild(13),
          epicChild(14, { status: 'Done' }),
          epicChild(15),
          epicChild(16, { archived: true }),
        ]),
        cycles,
      );

      const dialog = screen.getByRole('dialog', {
        name: 'Plan T12 into Launch?',
      });
      expect(
        within(dialog)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['T13 Pay 13 · Todo', 'T14 Pay 14 · Done · leaves "Beta"']);
      expect(planTicket).not.toHaveBeenCalled();
    });

    it('plans the Epic with its children', async () => {
      vi.mocked(planTicket).mockResolvedValue({ ok: true });
      await pick(epic([epicChild(13)]), cycles);

      await userEvent.click(
        screen.getByRole('button', { name: 'Epic and 1 child' }),
      );

      expect(planTicket).toHaveBeenCalledExactlyOnceWith({
        cycleId: 8,
        number: 12,
        withChildren: true,
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('changes nothing on Cancel', async () => {
      await pick(epic([epicChild(13)]), cycles);

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(planTicket).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(
        screen.getByRole<HTMLSelectElement>('combobox', {
          name: 'Plan into a Cycle',
        }).value,
      ).toBe('');
    });

    it('plans at once when no child qualifies', async () => {
      vi.mocked(planTicket).mockResolvedValue({ ok: true });
      await pick(
        epic([epicChild(15), epicChild(16, { archived: true })]),
        cycles,
      );

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(planTicket).toHaveBeenCalledExactlyOnceWith({
        cycleId: 8,
        number: 12,
      });
    });

    it('never prompts for a Ticket that is not an Epic', async () => {
      vi.mocked(planTicket).mockResolvedValue({ ok: true });
      await pick({ ...open, children: [epicChild(13)] }, cycles);

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(planTicket).toHaveBeenCalledExactlyOnceWith({
        cycleId: 8,
        number: 12,
      });
    });
  });

  describe('removing an Epic', () => {
    const inCycle = (...ticketNumbers: number[]) => [
      cycle({ id: 8, title: 'Launch', ticketNumbers: [12, ...ticketNumbers] }),
    ];
    const remove = (
      ticket: Parameters<typeof CyclePlanner>[0]['ticket'],
      cycles: Cycle[],
    ) => {
      renderWithTheme(<CyclePlanner ticket={ticket} cycles={cycles} />);
      return userEvent.click(
        screen.getByRole('button', { name: 'Remove from Cycle' }),
      );
    };

    it('asks first, listing the children in the Cycle', async () => {
      await remove(
        epic([
          epicChild(13),
          epicChild(14, { status: 'Done' }),
          epicChild(15),
          epicChild(16, { archived: true }),
        ]),
        inCycle(13, 14, 16),
      );

      const dialog = screen.getByRole('dialog', {
        name: 'Remove T12 from Launch?',
      });
      expect(
        within(dialog)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['T13 Pay 13 · Todo', 'T14 Pay 14 · Done']);
      expect(unplanTicket).not.toHaveBeenCalled();
    });

    it('removes the Epic with its children', async () => {
      vi.mocked(unplanTicket).mockResolvedValue({ ok: true });
      await remove(epic([epicChild(13)]), inCycle(13));

      await userEvent.click(
        screen.getByRole('button', { name: 'Epic and 1 child' }),
      );

      expect(unplanTicket).toHaveBeenCalledExactlyOnceWith({
        cycleId: 8,
        number: 12,
        withChildren: true,
      });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('unplans at once when no live child is in the Cycle', async () => {
      vi.mocked(unplanTicket).mockResolvedValue({ ok: true });
      await remove(
        epic([epicChild(13), epicChild(16, { archived: true })]),
        inCycle(16),
      );

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(unplanTicket).toHaveBeenCalledExactlyOnceWith({
        cycleId: 8,
        number: 12,
      });
    });

    it('never prompts for a Ticket that is not an Epic', async () => {
      vi.mocked(unplanTicket).mockResolvedValue({ ok: true });
      await remove({ ...open, children: [epicChild(13)] }, inCycle(13));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(unplanTicket).toHaveBeenCalledExactlyOnceWith({
        cycleId: 8,
        number: 12,
      });
    });

    it('never prompts about its Epic when a child is unplanned', async () => {
      vi.mocked(unplanTicket).mockResolvedValue({ ok: true });
      await remove(open, inCycle());

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(unplanTicket).toHaveBeenCalledOnce();
    });
  });
});
