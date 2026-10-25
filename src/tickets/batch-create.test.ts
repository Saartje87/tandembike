// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import type { Change } from './changes';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';

const setUp = () => {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  return { tickets, project };
};

describe('Creating Tickets in a batch', () => {
  it('creates each Ticket in order, with its fields', () => {
    const { tickets, project } = setUp();

    const created = tickets.createTicketBatch({
      projectId: project.id,
      tickets: [
        {
          title: 'Design the header',
          description: 'Two options.',
          labels: ['Design'],
          acceptanceCriteria: [{ text: 'Approved' }],
        },
        { title: 'Build the header', status: 'In progress' },
      ],
    });

    expect(created.map(({ number }) => number)).toEqual([1, 2]);
    expect(tickets.getTicket(1)).toMatchObject({
      title: 'Design the header',
      description: 'Two options.',
      status: 'Todo',
      projectId: project.id,
      labels: ['design'],
      acceptanceCriteria: [{ text: 'Approved', checked: false }],
    });
    expect(tickets.getTicket(2)).toMatchObject({
      title: 'Build the header',
      status: 'In progress',
    });
  });

  it('records Blockers given by position in the batch', () => {
    const { tickets, project } = setUp();

    const [design, build, ship] = tickets.createTicketBatch({
      projectId: project.id,
      tickets: [
        { title: 'Design' },
        { title: 'Build', blockedByPositions: [0] },
        { title: 'Ship', blockedByPositions: [0, 1] },
      ],
    });

    expect(tickets.getTicket(build.number).blockedBy).toEqual([design.number]);
    expect(tickets.getTicket(ship.number)).toMatchObject({
      blockedBy: [design.number, build.number],
      blocked: true,
    });
  });

  it('creates the Tickets under an Epic', () => {
    const { tickets, project } = setUp();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });

    const created = tickets.createTicketBatch({
      projectId: project.id,
      epicNumber: epic.number,
      tickets: [{ title: 'Pay by card', status: 'Done' }, { title: 'Refund' }],
    });

    expect(
      tickets.getTicket(epic.number).children.map(({ number }) => number),
    ).toEqual(created.map(({ number }) => number));
    expect(tickets.getTicket(epic.number).status).toBe('In progress');
  });

  it('announces the new Tickets once, with their Epic', () => {
    const { tickets, project } = setUp();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const announced: Change[] = [];
    tickets.subscribe((change) => announced.push(change));

    const created = tickets.createTicketBatch({
      projectId: project.id,
      epicNumber: epic.number,
      tickets: [{ title: 'One' }, { title: 'Two' }],
    });

    expect(announced).toEqual([
      {
        type: 'tickets',
        numbers: [...created.map(({ number }) => number), epic.number],
      },
    ]);
  });

  it('plans every Ticket into a Cycle of its Project', () => {
    const { tickets, project } = setUp();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });

    const created = tickets.createTicketBatch({
      projectId: project.id,
      cycleId: cycle.id,
      tickets: [
        { title: 'Design' },
        { title: 'Build', blockedByPositions: [0] },
      ],
    });

    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual(
      created.map(({ number }) => number),
    );
    expect(tickets.getTicket(created[1].number).blockedBy).toEqual([
      created[0].number,
    ]);
  });
});

describe('Refusing a batch', () => {
  it('names the offending item and creates nothing', () => {
    const { tickets, project } = setUp();

    expect(
      errorFrom(() =>
        tickets.createTicketBatch({
          projectId: project.id,
          tickets: [{ title: 'Design' }, { title: ' ' }],
        }),
      ),
    ).toEqual(
      new ValidationError({
        'tickets[1].title': 'Ticket at position 1: Enter a title.',
      }),
    );
    expect(tickets.listTickets()).toEqual([]);
  });

  it.each([
    [
      [1],
      'Ticket at position 1: blockedByPositions can only name earlier positions, from 0 to 0.',
    ],
    [
      [0, 0],
      'Ticket at position 1: name each position in blockedByPositions once.',
    ],
    [
      [-1],
      'Ticket at position 1: blockedByPositions can only name earlier positions, from 0 to 0.',
    ],
  ])('refuses blockedByPositions %j', (positions, reason) => {
    const { tickets, project } = setUp();

    expect(
      errorFrom(() =>
        tickets.createTicketBatch({
          projectId: project.id,
          tickets: [
            { title: 'Design' },
            { title: 'Build', blockedByPositions: positions },
          ],
        }),
      ),
    ).toEqual(new ValidationError({ 'tickets[1].blockedByPositions': reason }));
  });

  it('refuses a first Ticket with Blockers', () => {
    const { tickets, project } = setUp();

    expect(
      errorFrom(() =>
        tickets.createTicketBatch({
          projectId: project.id,
          tickets: [{ title: 'Design', blockedByPositions: [0] }],
        }),
      ),
    ).toEqual(
      new ValidationError({
        'tickets[0].blockedByPositions':
          'Ticket at position 0: blockedByPositions can only name earlier positions, and it is first.',
      }),
    );
  });

  it.each([
    [0, 'Give at least one Ticket to create.'],
    [51, 'Create at most 50 Tickets at a time.'],
  ])('refuses %i Tickets', (count, reason) => {
    const { tickets, project } = setUp();

    expect(
      errorFrom(() =>
        tickets.createTicketBatch({
          projectId: project.id,
          tickets: Array.from({ length: count }, (_, index) => ({
            title: `Ticket ${index}`,
          })),
        }),
      ),
    ).toEqual(new ValidationError({ tickets: reason }));
  });

  it('refuses a missing, Archived or other-Project Cycle, creating nothing', () => {
    const { tickets, project } = setUp();
    const other = tickets.createProject({ name: 'App' });
    const elsewhere = tickets.createCycle({
      projectId: other.id,
      title: 'App',
    });
    const archived = tickets.createCycle({
      projectId: project.id,
      title: 'Old',
    });
    tickets.startCycle(archived.id);
    tickets.archiveCycle(archived.id);
    const create = (cycleId: number) => () =>
      tickets.createTicketBatch({
        projectId: project.id,
        cycleId,
        tickets: [{ title: 'A' }, { title: 'B' }],
      });

    expect(errorFrom(create(99))).toEqual(
      new NotFoundError('There is no Cycle with id 99.'),
    );
    expect(errorFrom(create(archived.id))).toBeInstanceOf(NotAllowedError);
    expect(errorFrom(create(elsewhere.id))).toEqual(
      new NotAllowedError(
        'The Cycle "App" is in another Project. A Cycle holds only its own Project\'s Tickets.',
      ),
    );
    expect(tickets.listTickets()).toEqual([]);
  });

  it('refuses a missing Project or an unusable Epic, creating nothing', () => {
    const { tickets, project } = setUp();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Not an Epic',
    });

    expect(
      errorFrom(() =>
        tickets.createTicketBatch({ projectId: 99, tickets: [{ title: 'A' }] }),
      ),
    ).toEqual(new NotFoundError('There is no Project with id 99.'));
    expect(
      errorFrom(() =>
        tickets.createTicketBatch({
          projectId: project.id,
          epicNumber: ticket.number,
          tickets: [{ title: 'A' }],
        }),
      ),
    ).toEqual(
      new NotAllowedError(
        `Ticket #${ticket.number} is not an Epic. Only an Epic can have child Tickets.`,
      ),
    );
    expect(tickets.listTickets().map(({ number }) => number)).toEqual([
      ticket.number,
    ]);
  });
});
