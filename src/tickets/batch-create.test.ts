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

  it('records existing Tickets as Blockers by number, next to positions', () => {
    const { tickets, project } = setUp();
    const other = tickets.createProject({ name: 'Backend' });
    const api = tickets.createTicket({ projectId: other.id, title: 'API' });
    const spec = tickets.createTicket({ projectId: project.id, title: 'Spec' });
    const announced: Change[] = [];
    tickets.subscribe((change) => announced.push(change));

    const [design, build] = tickets.createTicketBatch({
      projectId: project.id,
      tickets: [
        { title: 'Design', blockedByNumbers: [spec.number] },
        {
          title: 'Build',
          blockedByPositions: [0],
          blockedByNumbers: [api.number, spec.number],
        },
      ],
    });

    expect(tickets.getTicket(design.number).blockedBy).toEqual([spec.number]);
    expect(tickets.getTicket(build.number).blockedBy).toEqual([
      api.number,
      spec.number,
      design.number,
    ]);
    expect(
      tickets.listBlockers(spec.number).blocks.map(({ number }) => number),
    ).toEqual([design.number, build.number]);
    expect(
      tickets.listActivity(api.number).map(({ changes }) => changes),
    ).toContainEqual([{ type: 'blocksAdded', number: build.number }]);
    expect(announced).toEqual([
      {
        type: 'tickets',
        numbers: [design.number, build.number, spec.number, api.number],
      },
    ]);
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

  it('plans every Ticket into a Cycle of its Project, under an Epic too', () => {
    const { tickets, project } = setUp();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Header',
      type: 'Epic',
    });

    const created = tickets.createTicketBatch({
      projectId: project.id,
      epicNumber: epic.number,
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
    expect(
      tickets.getTicket(epic.number).children.map(({ number }) => number),
    ).toEqual(created.map(({ number }) => number));
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

  it('refuses a missing Blocker number, creating nothing', () => {
    const { tickets, project } = setUp();

    expect(
      errorFrom(() =>
        tickets.createTicketBatch({
          projectId: project.id,
          tickets: [
            { title: 'Design' },
            { title: 'Build', blockedByNumbers: [99] },
          ],
        }),
      ),
    ).toEqual(
      new NotFoundError('Ticket at position 1: There is no Ticket T99.'),
    );
    expect(tickets.listTickets()).toEqual([]);
  });

  it('refuses a Blocker number named twice', () => {
    const { tickets, project } = setUp();
    const spec = tickets.createTicket({ projectId: project.id, title: 'Spec' });

    expect(
      errorFrom(() =>
        tickets.createTicketBatch({
          projectId: project.id,
          tickets: [
            { title: 'Design', blockedByNumbers: [spec.number, spec.number] },
          ],
        }),
      ),
    ).toEqual(
      new ValidationError({
        'tickets[0].blockedByNumbers':
          'Ticket at position 0: name each Ticket in blockedByNumbers once.',
      }),
    );
  });

  it('refuses an Epic blocking its own new child, creating nothing', () => {
    const { tickets, project } = setUp();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });

    expect(
      errorFrom(() =>
        tickets.createTicketBatch({
          projectId: project.id,
          epicNumber: epic.number,
          tickets: [
            { title: 'Pay' },
            { title: 'Refund', blockedByNumbers: [epic.number] },
          ],
        }),
      ),
    ).toEqual(
      new ValidationError({
        'tickets[1].blockedByNumbers': `Ticket at position 1: T${epic.number + 2} is a child of Epic T${epic.number}. An Epic and its own children cannot block each other; order the children with Blockers among themselves.`,
      }),
    );
    expect(tickets.listTickets().map(({ number }) => number)).toEqual([
      epic.number,
    ]);
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
        `Ticket T${ticket.number} is not an Epic. Only an Epic can have child Tickets.`,
      ),
    );
    expect(tickets.listTickets().map(({ number }) => number)).toEqual([
      ticket.number,
    ]);
  });
});

describe('Referring to a Ticket in the batch by position', () => {
  it('replaces {{T:n}} in titles, descriptions and criteria, in any direction', () => {
    const { tickets, project } = setUp();
    tickets.createTicket({ projectId: project.id, title: 'Existing' });

    const created = tickets.createTicketBatch({
      projectId: project.id,
      tickets: [
        {
          title: 'Design, then {{T:1}}',
          description: 'Own {{T:0}}, next {{T:1}}, {{T:1}} again.',
          acceptanceCriteria: [{ text: 'Matches {{T:1}}' }, { text: 'Plain' }],
        },
        { title: 'Build after {{T:0}}' },
      ],
    });

    expect(created.map(({ number }) => number)).toEqual([2, 3]);
    expect(tickets.getTicket(2)).toMatchObject({
      title: 'Design, then T3',
      description: 'Own T2, next T3, T3 again.',
      acceptanceCriteria: [
        { text: 'Matches T3', checked: false },
        { text: 'Plain', checked: false },
      ],
    });
    expect(tickets.getTicket(3).title).toBe('Build after T2');
  });

  it('replaces inside code and leaves other text unchanged', () => {
    const { tickets, project } = setUp();
    const text = '`{{T:0}}` {{T}} {{ T:0 }} {T:0} {{T:-1}} {{t:0}} {{T:0.5}}';

    tickets.createTicketBatch({
      projectId: project.id,
      tickets: [{ title: 'A', description: '```\n{{T:0}}\n```\n' + text }],
    });

    expect(tickets.getTicket(1).description).toBe(
      '```\nT1\n```\n`T1` {{T}} {{ T:0 }} {T:0} {{T:-1}} {{t:0}} {{T:0.5}}',
    );
  });

  it('leaves file_tickets text as given', () => {
    const { tickets, project } = setUp();

    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'See {{T:0}}',
    });

    expect(ticket.title).toBe('See {{T:0}}');
  });

  it.each([
    ['title', { title: 'See {{T:2}}' }, 'tickets[1].title'],
    [
      'description',
      { title: 'B', description: 'See {{T:9}}' },
      'tickets[1].description',
    ],
    [
      'criterion',
      { title: 'B', acceptanceCriteria: [{ text: 'See {{T:2}}' }] },
      'tickets[1].acceptanceCriteria',
    ],
  ])('refuses a position outside the batch in a %s', (_, ticket, field) => {
    const { tickets, project } = setUp();

    const error = errorFrom(() =>
      tickets.createTicketBatch({
        projectId: project.id,
        tickets: [{ title: 'A' }, ticket],
      }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors[field]).toMatch(
      /^Ticket at position 1: .*\{\{T:\d+\}\}.*positions? 0 to 1/,
    );
    expect(tickets.listTickets()).toEqual([]);
  });

  it('checks length limits after replacement', () => {
    const { tickets, project } = setUp();

    tickets.createTicketBatch({
      projectId: project.id,
      tickets: [{ title: `${'a'.repeat(197)}{{T:0}}` }],
    });
    expect(tickets.getTicket(1).title).toBe(`${'a'.repeat(197)}T1`);

    const error = errorFrom(() =>
      tickets.createTicketBatch({
        projectId: project.id,
        tickets: [{ title: 'B' }, { title: `${'a'.repeat(199)}{{T:0}}` }],
      }),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors).toHaveProperty(
      'tickets[1].title',
    );
    expect(tickets.listTickets().map(({ number }) => number)).toEqual([1]);
  });

  it('names the Ticket by position when only the real numbers exceed a limit', () => {
    const { tickets, project } = setUp();
    const fillers = Array.from({ length: 10 }, (_, i) => ({ title: `F${i}` }));

    // `T0` stands in for the number first (200 characters); `T11` is one longer.
    const error = errorFrom(() =>
      tickets.createTicketBatch({
        projectId: project.id,
        tickets: [...fillers, { title: `${'a'.repeat(198)}{{T:10}}` }],
      }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    const { fieldErrors } = error as ValidationError;
    expect(Object.keys(fieldErrors)).toEqual(['tickets[10].title']);
    expect(fieldErrors['tickets[10].title']).toMatch(
      /^Ticket at position 10: /,
    );
    expect(tickets.listTickets()).toEqual([]);
  });
});
