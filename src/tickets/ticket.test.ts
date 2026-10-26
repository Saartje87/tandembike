// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotFoundError, ValidationError } from './errors';
import type { Status } from './status';

describe('Creating Tickets', () => {
  it('creates a Ticket in Todo and lists it', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      description: 'It overlaps the logo.',
    });

    expect(ticket).toMatchObject({
      number: 1,
      title: 'Fix the header',
      description: 'It overlaps the logo.',
      status: 'Todo',
      projectId: project.id,
      archived: false,
    });
    expect(ticket.createdAt).toBeInstanceOf(Date);
    expect(ticket.updatedAt).toEqual(ticket.createdAt);
    expect(tickets.listTickets({ projectId: project.id })).toEqual([ticket]);
  });

  it('numbers Tickets sequentially across the whole app', () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });

    const numbers = [
      tickets.createTicket({ projectId: website.id, title: 'One' }),
      tickets.createTicket({ projectId: app.id, title: 'Two' }),
      tickets.createTicket({ projectId: website.id, title: 'Three' }),
    ].map((ticket) => ticket.number);

    expect(numbers).toEqual([1, 2, 3]);
  });

  it('creates a Ticket in the Status it is given', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      status: 'In progress',
    });

    expect(ticket.status).toBe('In progress');
  });

  it('trims the title and leaves out a missing description', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const ticket = tickets.createTicket({
      projectId: project.id,
      title: '  Fix the header \n',
    });

    expect(ticket.title).toBe('Fix the header');
    expect(ticket.description).toBe('');
  });

  it.each([
    ['an empty title', '', 'Enter a title.'],
    ['a blank title', '  \n ', 'Enter a title.'],
    ['a two-line title', 'Fix the\nheader', 'Keep the title to one line.'],
    [
      'a 201-character title',
      'x'.repeat(201),
      'Keep the title to 200 characters or fewer.',
    ],
  ])('refuses %s', (_label, title, reason) => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(
      errorFrom(() => tickets.createTicket({ projectId: project.id, title })),
    ).toEqual(new ValidationError({ title: reason }));
    expect(tickets.listTickets()).toEqual([]);
  });

  it('keeps a description of 50,000 characters', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      description: 'x'.repeat(50_000),
    });

    expect(ticket.description).toHaveLength(50_000);
  });

  it('gives a reason for every field that breaks the rules', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const error = errorFrom(() =>
      tickets.createTicket({
        projectId: project.id,
        title: '',
        description: 'x'.repeat(50_001),
      }),
    );

    expect(error).toEqual(
      new ValidationError({
        title: 'Enter a title.',
        description: 'Keep the description to 50,000 characters or fewer.',
      }),
    );
    expect(error).toHaveProperty(
      'message',
      'Enter a title. Keep the description to 50,000 characters or fewer.',
    );
  });

  it('refuses a Status that does not exist', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const error = errorFrom(() =>
      tickets.createTicket({
        projectId: project.id,
        title: 'Fix the header',
        status: 'Blocked' as Status,
      }),
    );

    expect(error).toEqual(
      new ValidationError({
        status: 'Choose a Status: Todo, In progress or Done.',
      }),
    );
  });

  it('refuses a Project that does not exist', () => {
    const tickets = createTestTickets();

    expect(
      errorFrom(() => tickets.createTicket({ projectId: 7, title: 'Fix it' })),
    ).toEqual(new NotFoundError('There is no Project with id 7.'));
    expect(tickets.listTickets()).toEqual([]);
  });

  it('announces a created Ticket and nothing for a refused one', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const listener = vi.fn();
    tickets.subscribe(listener);

    errorFrom(() => tickets.createTicket({ projectId: project.id, title: '' }));
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      type: 'ticket',
      number: ticket.number,
    });
  });

  it('accepts a title of exactly 200 characters', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'x'.repeat(200),
    });

    expect(ticket.title).toHaveLength(200);
  });
});

describe('Listing Tickets', () => {
  it("lists only the given Project's Tickets, oldest-created first", () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });
    tickets.createTicket({ projectId: website.id, title: 'First' });
    tickets.createTicket({ projectId: app.id, title: 'Elsewhere' });
    tickets.createTicket({ projectId: website.id, title: 'Second' });
    tickets.createTicket({ projectId: website.id, title: 'Third' });

    expect(
      tickets.listTickets({ projectId: website.id }).map(({ title }) => title),
    ).toEqual(['First', 'Second', 'Third']);
  });

  it('lists only Tickets in the given Status', () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });
    tickets.createTicket({ projectId: website.id, title: 'Waiting' });
    tickets.createTicket({
      projectId: website.id,
      title: 'Started',
      status: 'In progress',
    });
    tickets.createTicket({
      projectId: app.id,
      title: 'Started elsewhere',
      status: 'In progress',
    });

    expect(
      tickets
        .listTickets({ projectId: website.id, status: 'In progress' })
        .map(({ title }) => title),
    ).toEqual(['Started']);
    expect(
      tickets.listTickets({ status: 'In progress' }).map(({ title }) => title),
    ).toEqual(['Started', 'Started elsewhere']);
  });

  it('leaves out archived Tickets unless asked to include them', () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: website.id, title: 'Active' });
    const old = tickets.createTicket({ projectId: website.id, title: 'Old' });
    tickets.createTicket({ projectId: website.id, title: 'Also active' });
    tickets.archiveTicket(old.number);

    expect(
      tickets.listTickets({ projectId: website.id }).map(({ title }) => title),
    ).toEqual(['Active', 'Also active']);
    expect(
      tickets
        .listTickets({ projectId: website.id, includeArchived: true })
        .map(({ title }) => title),
    ).toEqual(['Active', 'Old', 'Also active']);
  });
});

describe('Ordering Tickets', () => {
  it('assigns a new Ticket to the end of its Project and Status lane', () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const otherProject = tickets.createProject({ name: 'App' });
    const first = tickets.createTicket({
      projectId: website.id,
      title: 'First',
    });
    const inProgress = tickets.createTicket({
      projectId: website.id,
      title: 'In progress',
      status: 'In progress',
    });
    const second = tickets.createTicket({
      projectId: website.id,
      title: 'Second',
    });
    const elsewhere = tickets.createTicket({
      projectId: otherProject.id,
      title: 'Elsewhere',
    });

    expect(
      [first, inProgress, second, elsewhere].map(({ number, position }) => [
        number,
        position,
      ]),
    ).toEqual([
      [first.number, 0],
      [inProgress.number, 0],
      [second.number, 1],
      [elsewhere.number, 0],
    ]);
  });

  it('places a Ticket moved to a different Status at the end of that lane', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const moving = tickets.createTicket({
      projectId: project.id,
      title: 'Moving',
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Already done',
      status: 'Done',
    });

    const moved = tickets.updateTicket(moving.number, { status: 'Done' });

    expect(moved.position).toBe(1);
  });

  it('persists a manually chosen order within its Project and Status lane', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const first = tickets.createTicket({
      projectId: project.id,
      title: 'First',
    });
    const second = tickets.createTicket({
      projectId: project.id,
      title: 'Second',
    });
    const third = tickets.createTicket({
      projectId: project.id,
      title: 'Third',
    });
    const done = tickets.createTicket({
      projectId: project.id,
      title: 'Done',
      status: 'Done',
    });

    tickets.reorderTickets({
      projectId: project.id,
      status: 'Todo',
      ticketNumbers: [third.number, first.number, second.number],
    });

    expect(
      tickets
        .listTickets({ projectId: project.id })
        .map(({ number, position }) => [number, position]),
    ).toEqual([
      [first.number, 1],
      [second.number, 2],
      [third.number, 0],
      [done.number, 0],
    ]);
  });

  it('refuses an incomplete lane order without changing any Ticket positions', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const first = tickets.createTicket({
      projectId: project.id,
      title: 'First',
    });
    const second = tickets.createTicket({
      projectId: project.id,
      title: 'Second',
    });

    expect(
      errorFrom(() =>
        tickets.reorderTickets({
          projectId: project.id,
          status: 'Todo',
          ticketNumbers: [second.number],
        }),
      ),
    ).toEqual(
      new ValidationError({
        ticketNumbers: 'Refresh the Board and try reordering again.',
      }),
    );
    expect(tickets.getTicket(first.number).position).toBe(0);
    expect(tickets.getTicket(second.number).position).toBe(1);
  });
});

describe('Updating Tickets', () => {
  const setUp = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-01T09:00:00Z'));
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: website.id,
      title: 'Fix the header',
      description: 'It overlaps the logo.',
    });
    vi.setSystemTime(new Date('2026-03-02T10:30:00Z'));
    return { tickets, website, ticket };
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('changes only the Status and bumps the updated time', () => {
    const { tickets, website, ticket } = setUp();

    const updated = tickets.updateTicket(ticket.number, { status: 'Done' });

    expect(updated).toEqual({
      ...ticket,
      status: 'Done',
      updatedAt: new Date('2026-03-02T10:30:00Z'),
    });
    expect(tickets.listTickets({ projectId: website.id })).toEqual([updated]);
  });

  it.each([
    ['Todo', 'In progress'],
    ['In progress', 'Done'],
    ['Done', 'Todo'],
    ['Todo', 'Done'],
    ['Done', 'In progress'],
    ['In progress', 'Todo'],
  ] as const)('moves a Ticket from %s to %s', (from, to) => {
    const { tickets, ticket } = setUp();
    tickets.updateTicket(ticket.number, { status: from });

    expect(tickets.updateTicket(ticket.number, { status: to }).status).toBe(to);
  });

  it('changes the title, description and Project together, trimming the title', () => {
    const { tickets, ticket } = setUp();
    const app = tickets.createProject({ name: 'App' });

    const updated = tickets.updateTicket(ticket.number, {
      title: '  Fix the footer ',
      description: '',
      projectId: app.id,
    });

    expect(updated).toEqual({
      ...ticket,
      title: 'Fix the footer',
      description: '',
      projectId: app.id,
      updatedAt: new Date('2026-03-02T10:30:00Z'),
    });
    expect(tickets.listTickets({ projectId: app.id })).toEqual([updated]);
  });

  it('keeps the Ticket number when the Ticket moves to another Project', () => {
    const { tickets, website, ticket } = setUp();
    const app = tickets.createProject({ name: 'App' });
    tickets.createTicket({ projectId: app.id, title: 'Add a login' });

    tickets.updateTicket(ticket.number, { projectId: app.id });

    expect(tickets.getTicket(1)).toMatchObject({
      number: 1,
      title: 'Fix the header',
      projectId: app.id,
    });
    expect(tickets.listTickets({ projectId: website.id })).toEqual([]);
    expect(
      tickets.createTicket({ projectId: website.id, title: 'Next' }).number,
    ).toBe(3);
  });

  it('bumps the updated time even when no fields are given', () => {
    const { tickets, ticket } = setUp();

    expect(tickets.updateTicket(ticket.number, {})).toEqual({
      ...ticket,
      updatedAt: new Date('2026-03-02T10:30:00Z'),
    });
  });

  it('refuses fields that break the create rules and changes nothing', () => {
    const { tickets, website, ticket } = setUp();

    const error = errorFrom(() =>
      tickets.updateTicket(ticket.number, {
        title: 'Fix the\nheader',
        description: 'x'.repeat(50_001),
        status: 'Blocked' as Status,
      }),
    );

    expect(error).toEqual(
      new ValidationError({
        title: 'Keep the title to one line.',
        description: 'Keep the description to 50,000 characters or fewer.',
        status: 'Choose a Status: Todo, In progress or Done.',
      }),
    );
    expect(tickets.listTickets({ projectId: website.id })).toEqual([ticket]);
  });

  it('refuses an empty title', () => {
    const { tickets, ticket } = setUp();

    expect(
      errorFrom(() => tickets.updateTicket(ticket.number, { title: ' ' })),
    ).toEqual(new ValidationError({ title: 'Enter a title.' }));
  });

  it('refuses a Project that does not exist', () => {
    const { tickets, website, ticket } = setUp();

    expect(
      errorFrom(() => tickets.updateTicket(ticket.number, { projectId: 7 })),
    ).toEqual(new NotFoundError('There is no Project with id 7.'));
    expect(tickets.listTickets({ projectId: website.id })).toEqual([ticket]);
  });

  it('says when the Ticket does not exist', () => {
    const { tickets } = setUp();

    expect(
      errorFrom(() => tickets.updateTicket(42, { status: 'Done' })),
    ).toEqual(new NotFoundError('There is no Ticket T42.'));
  });

  it('announces an updated Ticket and nothing for a refused update', () => {
    const { tickets, ticket } = setUp();
    const listener = vi.fn();
    tickets.subscribe(listener);

    errorFrom(() => tickets.updateTicket(ticket.number, { title: '' }));
    errorFrom(() => tickets.updateTicket(42, { status: 'Done' }));
    tickets.updateTicket(ticket.number, { status: 'Done' });

    expect(listener).toHaveBeenCalledExactlyOnceWith({
      type: 'ticket',
      number: ticket.number,
    });
  });
});

describe('Getting a Ticket', () => {
  it('gets a Ticket by its number', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'First' });
    const second = tickets.createTicket({
      projectId: project.id,
      title: 'Second',
      description: 'Details',
    });

    expect(tickets.getTicket(2)).toEqual(second);
  });

  it('says when a Ticket does not exist', () => {
    const tickets = createTestTickets();

    expect(errorFrom(() => tickets.getTicket(42))).toEqual(
      new NotFoundError('There is no Ticket T42.'),
    );
  });
});

describe('Archiving and restoring Tickets', () => {
  const setUp = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-01T09:00:00Z'));
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: website.id,
      title: 'Fix the header',
      description: 'It overlaps the logo.',
      status: 'In progress',
    });
    vi.setSystemTime(new Date('2026-03-02T10:30:00Z'));
    return { tickets, website, ticket };
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('archives a Ticket, changing only the archived flag and updated time', () => {
    const { tickets, ticket } = setUp();

    const archived = tickets.archiveTicket(ticket.number);

    expect(archived).toEqual({
      ...ticket,
      archived: true,
      updatedAt: new Date('2026-03-02T10:30:00Z'),
    });
    expect(tickets.getTicket(ticket.number)).toEqual(archived);
  });

  it('restores an archived Ticket exactly as it was', () => {
    const { tickets, ticket } = setUp();
    tickets.archiveTicket(ticket.number);
    vi.setSystemTime(new Date('2026-03-03T08:00:00Z'));

    const restored = tickets.restoreTicket(ticket.number);

    expect(restored).toEqual({
      ...ticket,
      archived: false,
      updatedAt: new Date('2026-03-03T08:00:00Z'),
    });
    expect(tickets.getTicket(ticket.number)).toEqual(restored);
  });

  it('says when the Ticket does not exist', () => {
    const { tickets } = setUp();

    expect(errorFrom(() => tickets.archiveTicket(42))).toEqual(
      new NotFoundError('There is no Ticket T42.'),
    );
    expect(errorFrom(() => tickets.restoreTicket(42))).toEqual(
      new NotFoundError('There is no Ticket T42.'),
    );
  });

  it('announces archiving and restoring, and nothing for a missing Ticket', () => {
    const { tickets, ticket } = setUp();
    const listener = vi.fn();
    tickets.subscribe(listener);

    errorFrom(() => tickets.archiveTicket(42));
    errorFrom(() => tickets.restoreTicket(42));
    tickets.archiveTicket(ticket.number);
    tickets.restoreTicket(ticket.number);

    expect(listener.mock.calls).toEqual([
      [{ type: 'ticket', number: ticket.number }],
      [{ type: 'ticket', number: ticket.number }],
    ]);
  });

  it('deletes a Ticket only through deleteTicket, for the User (ADR 0012)', () => {
    const { tickets } = setUp();

    expect(
      Object.keys(tickets).filter(
        (name) =>
          /delete|remove/i.test(name) &&
          !/label|comment|blocker|externalreference/i.test(name),
      ),
    ).toEqual(['deleteTicket']);
  });
});
