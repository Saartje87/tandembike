// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';

/** A Project with a Prepared Cycle "Beta" and Tickets #1 to #`count`. */
function planningWith(count: number) {
  const changes = createChangeChannel();
  const tickets = createTestTickets(changes);
  const project = tickets.createProject({ name: 'Website' });
  for (let index = 1; index <= count; index++) {
    tickets.createTicket({ projectId: project.id, title: `Ticket ${index}` });
  }
  const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
  return { tickets, changes, project, cycle };
}

describe('Planning several Tickets into a Cycle at once', () => {
  it('plans every Ticket given, Done ones and members included', () => {
    const { tickets, cycle } = planningWith(3);
    tickets.planTicket({ cycleId: cycle.id, number: 2 });
    tickets.updateTicket(3, { status: 'Done' });

    const result = tickets.planTickets({
      cycleId: cycle.id,
      ticketNumbers: [3, 1, 2],
    });

    expect(result).toEqual({
      updated: [3, 1, 2],
      failed: [],
      cycle: { ...cycle, ticketNumbers: [1, 2, 3] },
    });
    expect(tickets.getCycle(cycle.id)).toEqual(result.cycle);
    expect(tickets.getTicket(3).status).toBe('Done');
  });

  it("reports each Ticket planTicket's rules refuse and still plans the rest", () => {
    const { tickets, project, cycle } = planningWith(3);
    const other = tickets.createProject({ name: 'App' });
    const elsewhere = tickets.createTicket({
      projectId: other.id,
      title: 'Elsewhere',
    });
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.planTicket({ cycleId: launch.id, number: 2 });
    tickets.archiveTicket(3);

    const result = tickets.planTickets({
      cycleId: cycle.id,
      ticketNumbers: [99, 1, 2, 3, elsewhere.number],
    });

    expect(result).toEqual({
      updated: [1],
      failed: [
        { number: 99, error: 'There is no Ticket #99.' },
        {
          number: 2,
          error:
            'Ticket #2 is already planned into the Cycle "Launch". Remove it from that Cycle first.',
        },
        {
          number: 3,
          error:
            'Ticket #3 is archived. Restore it before planning it into a Cycle.',
        },
        {
          number: elsewhere.number,
          error: `Ticket #${elsewhere.number} is in another Project. A Cycle holds only its own Project's Tickets.`,
        },
      ],
      cycle: { ...cycle, ticketNumbers: [1] },
    });
    expect(tickets.getCycle(launch.id).ticketNumbers).toEqual([2]);
  });
});

describe('Unplanning several Tickets from a Cycle at once', () => {
  it('takes every Ticket given back to the Backlog', () => {
    const { tickets, cycle } = planningWith(3);
    tickets.planTickets({ cycleId: cycle.id, ticketNumbers: [1, 2, 3] });

    const result = tickets.unplanTickets({
      cycleId: cycle.id,
      ticketNumbers: [3, 1],
    });

    expect(result).toEqual({
      updated: [3, 1],
      failed: [],
      cycle: { ...cycle, ticketNumbers: [2] },
    });
  });

  it("reports each Ticket unplanTicket's rules refuse and still unplans the rest", () => {
    const { tickets, cycle } = planningWith(2);
    tickets.planTicket({ cycleId: cycle.id, number: 1 });

    const result = tickets.unplanTickets({
      cycleId: cycle.id,
      ticketNumbers: [99, 2, 1],
    });

    expect(result).toEqual({
      updated: [1],
      failed: [
        { number: 99, error: 'There is no Ticket #99.' },
        { number: 2, error: 'Ticket #2 is not planned into the Cycle "Beta".' },
      ],
      cycle: { ...cycle, ticketNumbers: [] },
    });
  });
});

describe.each(['planTickets', 'unplanTickets'] as const)(
  'Refusing a whole %s call',
  (name) => {
    it.each([
      [
        'no Ticket numbers',
        [],
        { ticketNumbers: 'Choose at least one Ticket.' },
      ],
      [
        'more than 50 Ticket numbers',
        Array.from({ length: 51 }, (_, index) => index + 1),
        { ticketNumbers: 'Choose at most 50 Tickets at a time.' },
      ],
      [
        'a Ticket number given twice',
        [1, 2, 1],
        { ticketNumbers: 'Choose each Ticket once: #1 is given twice.' },
      ],
    ])(
      'refuses %s and changes nothing',
      (_case, ticketNumbers, fieldErrors) => {
        const { tickets, cycle } = planningWith(2);
        tickets.planTicket({ cycleId: cycle.id, number: 2 });

        expect(
          errorFrom(() => tickets[name]({ cycleId: cycle.id, ticketNumbers })),
        ).toEqual(new ValidationError(fieldErrors));
        expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([2]);
      },
    );

    it('refuses a Cycle that does not exist, or is Archived', () => {
      const { tickets, cycle } = planningWith(2);
      tickets.planTicket({ cycleId: cycle.id, number: 2 });
      tickets.startCycle(cycle.id);
      tickets.archiveCycle(cycle.id);

      expect(
        errorFrom(() => tickets[name]({ cycleId: 99, ticketNumbers: [1] })),
      ).toEqual(new NotFoundError('There is no Cycle with id 99.'));
      expect(
        errorFrom(() =>
          tickets[name]({ cycleId: cycle.id, ticketNumbers: [1, 2] }),
        ),
      ).toEqual(
        new NotAllowedError('The Cycle "Beta" is Archived and cannot change.'),
      );
      expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([2]);
    });

    it('announces the Cycle once for the whole batch, and not when nothing changed', () => {
      const { tickets, changes, cycle } = planningWith(2);
      tickets.planTickets({ cycleId: cycle.id, ticketNumbers: [1, 2] });
      const listener = vi.fn();
      changes.subscribe(listener);
      const numbers = name === 'planTickets' ? [99, 1, 2] : [1, 99, 2];

      tickets[name]({ cycleId: cycle.id, ticketNumbers: numbers });
      tickets[name]({ cycleId: cycle.id, ticketNumbers: [99] });

      expect(listener.mock.calls).toEqual([[{ type: 'cycle', id: cycle.id }]]);
    });
  },
);
