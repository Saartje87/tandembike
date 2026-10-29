// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';

/** A Project with Prepared Cycles "Alpha" and "Beta" and Tickets T1 to #`count`. */
function movingWith(count: number) {
  const changes = createChangeChannel();
  const tickets = createTestTickets(changes);
  const project = tickets.createProject({ name: 'Website' });
  for (let index = 1; index <= count; index++) {
    tickets.createTicket({ projectId: project.id, title: `Ticket ${index}` });
  }
  const alpha = tickets.createCycle({ projectId: project.id, title: 'Alpha' });
  const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
  return { tickets, changes, project, alpha, beta };
}

describe('Moving Tickets to a Cycle or the Backlog', () => {
  it('moves Tickets from another Cycle and from the Backlog into a Cycle in one step', () => {
    const { tickets, alpha, beta } = movingWith(3);
    tickets.planTickets({ cycleId: alpha.id, ticketNumbers: [1, 2] });

    const result = tickets.moveTicketsToCycle({
      cycleId: beta.id,
      ticketNumbers: [2, 3],
    });

    expect(result).toEqual({
      updated: [2, 3],
      failed: [],
      cycle: { ...beta, ticketNumbers: [2, 3] },
    });
    expect(tickets.getCycle(alpha.id).ticketNumbers).toEqual([1]);
  });
});

describe('Moving Tickets to the Backlog', () => {
  it('takes Tickets out of their open Cycle, and counts unplanned ones as moved', () => {
    const { tickets, alpha, beta } = movingWith(3);
    tickets.planTicket({ cycleId: alpha.id, number: 1 });
    tickets.planTicket({ cycleId: beta.id, number: 2 });

    const result = tickets.moveTicketsToCycle({
      cycleId: null,
      ticketNumbers: [1, 2, 3],
    });

    expect(result).toEqual({ updated: [1, 2, 3], failed: [], cycle: null });
    expect(tickets.getCycle(alpha.id).ticketNumbers).toEqual([]);
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([]);
  });

  it('leaves a Done Ticket in the Archived Cycle that keeps it', () => {
    const { tickets, alpha } = movingWith(1);
    tickets.planTicket({ cycleId: alpha.id, number: 1 });
    tickets.updateTicket(1, { status: 'Done' });
    tickets.startCycle(alpha.id);
    tickets.archiveCycle(alpha.id);

    const result = tickets.moveTicketsToCycle({
      cycleId: null,
      ticketNumbers: [1],
    });

    expect(result.updated).toEqual([1]);
    expect(tickets.getCycle(alpha.id).ticketNumbers).toEqual([1]);
  });
});

describe('Moving a Ticket to where it is already', () => {
  it('counts a member of the target Cycle as moved and announces nothing', () => {
    const { tickets, changes, alpha } = movingWith(1);
    tickets.planTicket({ cycleId: alpha.id, number: 1 });
    const listener = vi.fn();
    changes.subscribe(listener);

    const result = tickets.moveTicketsToCycle({
      cycleId: alpha.id,
      ticketNumbers: [1],
    });
    tickets.moveTicketsToCycle({ cycleId: null, ticketNumbers: [1] });
    listener.mockClear();
    tickets.moveTicketsToCycle({ cycleId: null, ticketNumbers: [1] });

    expect(result).toEqual({
      updated: [1],
      failed: [],
      cycle: { ...alpha, ticketNumbers: [1] },
    });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('Refusing some Tickets of a move', () => {
  it('reports each Ticket it cannot move, which stays where it was, and moves the rest', () => {
    const { tickets, project, alpha, beta } = movingWith(3);
    const other = tickets.createProject({ name: 'App' });
    const elsewhere = tickets.createTicket({
      projectId: other.id,
      title: 'Elsewhere',
    });
    tickets.planTickets({ cycleId: alpha.id, ticketNumbers: [1, 3] });
    tickets.archiveTicket(3);

    const result = tickets.moveTicketsToCycle({
      cycleId: beta.id,
      ticketNumbers: [99, 1, 3, elsewhere.number],
    });
    const fromBoard = tickets.moveTicketsToCycle({
      cycleId: null,
      ticketNumbers: [elsewhere.number, 2],
      projectId: project.id,
    });

    expect(result).toEqual({
      updated: [1],
      failed: [
        { number: 99, error: 'There is no Ticket T99.' },
        {
          number: 3,
          error:
            'Ticket T3 is archived. Restore it before planning it into a Cycle.',
        },
        {
          number: elsewhere.number,
          error: `Ticket T${elsewhere.number} is in another Project. A Cycle holds only its own Project's Tickets.`,
        },
      ],
      cycle: { ...beta, ticketNumbers: [1] },
    });
    expect(tickets.getCycle(alpha.id).ticketNumbers).toEqual([3]);
    expect(fromBoard.failed).toEqual([
      {
        number: elsewhere.number,
        error: `Ticket T${elsewhere.number} is in another Project.`,
      },
    ]);
  });

  it('refuses a Ticket of an archived Project, wherever it goes', () => {
    const { tickets, project, alpha } = movingWith(1);
    tickets.planTicket({ cycleId: alpha.id, number: 1 });
    tickets.archiveProject(project.id);

    expect(
      errorFrom(() =>
        tickets.moveTicketsToCycle({ cycleId: alpha.id, ticketNumbers: [1] }),
      ),
    ).toEqual(
      new NotAllowedError(
        'The Project "Website" is archived. Restore it before changing it or its Tickets.',
      ),
    );
    expect(
      tickets.moveTicketsToCycle({ cycleId: null, ticketNumbers: [1] }).failed,
    ).toEqual([
      {
        number: 1,
        error:
          'The Project "Website" is archived. Restore it before changing it or its Tickets.',
      },
    ]);
  });
});

describe('Refusing a whole move', () => {
  it.each([
    ['no Ticket numbers', [], { ticketNumbers: 'Choose at least one Ticket.' }],
    [
      'more than 50 Ticket numbers',
      Array.from({ length: 51 }, (_, index) => index + 1),
      { ticketNumbers: 'Choose at most 50 Tickets at a time.' },
    ],
    [
      'a Ticket number given twice',
      [1, 2, 1],
      { ticketNumbers: 'Choose each Ticket once: T1 is given twice.' },
    ],
  ])('refuses %s and changes nothing', (_case, ticketNumbers, fieldErrors) => {
    const { tickets, alpha } = movingWith(2);
    tickets.planTicket({ cycleId: alpha.id, number: 2 });

    expect(
      errorFrom(() =>
        tickets.moveTicketsToCycle({ cycleId: null, ticketNumbers }),
      ),
    ).toEqual(new ValidationError(fieldErrors));
    expect(tickets.getCycle(alpha.id).ticketNumbers).toEqual([2]);
  });

  it('refuses a Cycle that does not exist, is Archived, or is in another Project', () => {
    const { tickets, alpha, beta } = movingWith(2);
    const other = tickets.createProject({ name: 'App' });
    tickets.planTicket({ cycleId: beta.id, number: 2 });
    tickets.startCycle(alpha.id);
    tickets.archiveCycle(alpha.id);

    expect(
      errorFrom(() =>
        tickets.moveTicketsToCycle({ cycleId: 99, ticketNumbers: [1] }),
      ),
    ).toEqual(new NotFoundError('There is no Cycle with id 99.'));
    expect(
      errorFrom(() =>
        tickets.moveTicketsToCycle({ cycleId: alpha.id, ticketNumbers: [2] }),
      ),
    ).toEqual(
      new NotAllowedError('The Cycle "Alpha" is Archived and cannot change.'),
    );
    expect(
      errorFrom(() =>
        tickets.moveTicketsToCycle({
          cycleId: beta.id,
          ticketNumbers: [1],
          projectId: other.id,
        }),
      ),
    ).toEqual(new NotAllowedError('The Cycle "Beta" is in another Project.'));
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([2]);
  });
});

describe('Announcing a move', () => {
  it('announces each Cycle a Ticket left or joined, once', () => {
    const { tickets, changes, project, alpha, beta } = movingWith(3);
    const gamma = tickets.createCycle({
      projectId: project.id,
      title: 'Gamma',
    });
    tickets.planTickets({ cycleId: alpha.id, ticketNumbers: [1, 2] });
    tickets.planTicket({ cycleId: gamma.id, number: 3 });
    const listener = vi.fn();
    changes.subscribe(listener);

    tickets.moveTicketsToCycle({ cycleId: beta.id, ticketNumbers: [1, 2, 99] });
    const toBeta = listener.mock.calls.map(([change]) => change);
    listener.mockClear();
    tickets.moveTicketsToCycle({ cycleId: null, ticketNumbers: [3] });

    expect(toBeta).toEqual([
      { type: 'cycle', id: alpha.id },
      { type: 'cycle', id: beta.id },
    ]);
    expect(listener.mock.calls).toEqual([[{ type: 'cycle', id: gamma.id }]]);
  });
});
