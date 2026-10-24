// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { ValidationError } from './errors';
import type { TicketPage } from './tickets';

describe('Finding Tickets', () => {
  it('finds Tickets without their descriptions by default', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      description: 'It overlaps the logo.',
      labels: ['bug'],
    });

    expect(tickets.findTickets()).toEqual({
      tickets: [
        {
          number: ticket.number,
          title: 'Fix the header',
          status: 'Todo',
          type: 'Ticket',
          epic: null,
          projectId: project.id,
          labels: ['bug'],
          blockedBy: [],
          blocked: false,
          claim: null,
          archived: false,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
        },
      ],
      nextCursor: null,
    });
  });

  it('finds whole Tickets when descriptions are asked for', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      description: 'It overlaps the logo.',
    });

    expect(tickets.findTickets({ includeDescription: true })).toEqual({
      tickets: [ticket],
      nextCursor: null,
    });
  });

  it('finds Tickets whose title or description contains the query, ignoring case', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Fix the Header' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Logo',
      description: 'Move it under the header.',
    });
    tickets.createTicket({ projectId: project.id, title: 'Footer' });

    expect(titles(tickets.findTickets({ query: 'HEADER' }))).toEqual([
      'Fix the Header',
      'Logo',
    ]);
  });

  it('trims the query', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Header' });

    expect(titles(tickets.findTickets({ query: ' header ' }))).toEqual([
      'Header',
    ]);
  });

  it('matches % and _ in the query literally', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Grow by 50%' });
    tickets.createTicket({ projectId: project.id, title: 'Grow by 500' });
    tickets.createTicket({ projectId: project.id, title: 'Rename user_id' });
    tickets.createTicket({ projectId: project.id, title: 'Rename userXid' });
    tickets.createTicket({ projectId: project.id, title: 'Escape a\\b' });

    expect(titles(tickets.findTickets({ query: '50%' }))).toEqual([
      'Grow by 50%',
    ]);
    expect(titles(tickets.findTickets({ query: 'user_id' }))).toEqual([
      'Rename user_id',
    ]);
    expect(titles(tickets.findTickets({ query: 'a\\b' }))).toEqual([
      'Escape a\\b',
    ]);
  });

  it('combines the query with the Project, Status, label and archive filters', () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });
    const wanted = {
      projectId: website.id,
      title: 'Header bug',
      status: 'In progress' as const,
      labels: ['bug'],
    };
    tickets.createTicket(wanted);
    tickets.createTicket({ ...wanted, title: 'Footer bug' });
    tickets.createTicket({ ...wanted, projectId: app.id });
    tickets.createTicket({ ...wanted, status: 'Todo' });
    tickets.createTicket({ ...wanted, labels: [] });
    tickets.archiveTicket(
      tickets.createTicket({ ...wanted, title: 'Old header bug' }).number,
    );
    const filter = {
      query: 'header',
      projectId: website.id,
      status: 'In progress' as const,
      labels: ['BUG'],
    };

    expect(titles(tickets.findTickets(filter))).toEqual(['Header bug']);
    expect(
      titles(tickets.findTickets({ ...filter, includeArchived: true })),
    ).toEqual(['Header bug', 'Old header bug']);
  });

  it('pages through Tickets after the cursor, oldest-created first', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    for (const title of ['One', 'Two', 'Three']) {
      tickets.createTicket({ projectId: project.id, title });
    }

    const first = tickets.findTickets({ limit: 2 });
    const second = tickets.findTickets({
      limit: 2,
      cursor: first.nextCursor ?? 0,
    });

    expect([titles(first), first.nextCursor]).toEqual([['One', 'Two'], 2]);
    expect([titles(second), second.nextCursor]).toEqual([['Three'], null]);
  });

  it('pages a filtered list after a cursor Ticket that no longer matches', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    for (const title of ['Bug one', 'Chore', 'Bug two', 'Bug three']) {
      tickets.createTicket({ projectId: project.id, title });
    }

    const page = tickets.findTickets({ query: 'bug', cursor: 2, limit: 1 });

    expect([titles(page), page.nextCursor]).toEqual([['Bug two'], 3]);
  });

  it('lists 50 Tickets a page by default', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    for (let index = 1; index <= 51; index++) {
      tickets.createTicket({ projectId: project.id, title: `Ticket ${index}` });
    }

    const page = tickets.findTickets();

    expect(page.tickets).toHaveLength(50);
    expect(page.nextCursor).toBe(50);
  });

  it('has no next page when the last page is exactly full', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    for (const title of ['One', 'Two']) {
      tickets.createTicket({ projectId: project.id, title });
    }

    expect(tickets.findTickets({ limit: 2 }).nextCursor).toBeNull();
  });

  it('finds nothing as an empty page', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Fix the header' });

    expect(tickets.findTickets({ query: 'footer' })).toEqual({
      tickets: [],
      nextCursor: null,
    });
  });

  it.each([
    [
      'a limit below 1',
      { limit: 0 },
      { limit: 'Choose a limit from 1 to 200.' },
    ],
    [
      'a limit above 200',
      { limit: 201 },
      { limit: 'Choose a limit from 1 to 200.' },
    ],
    [
      'a fractional limit',
      { limit: 1.5 },
      { limit: 'Choose a limit from 1 to 200.' },
    ],
    [
      'a cursor that is no Ticket',
      { cursor: 9 },
      { cursor: 'There is no Ticket #9 to continue after.' },
    ],
    [
      'a blank query',
      { query: '  ' },
      { query: 'Enter text to search for, or leave the query out.' },
    ],
    [
      'a bad limit and cursor together',
      { limit: 0, cursor: 9 },
      {
        limit: 'Choose a limit from 1 to 200.',
        cursor: 'There is no Ticket #9 to continue after.',
      },
    ],
  ])('refuses %s', (_case, input, fieldErrors) => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Fix the header' });

    expect(errorFrom(() => tickets.findTickets(input))).toEqual(
      new ValidationError(fieldErrors),
    );
  });
});

function titles(page: TicketPage): string[] {
  return page.tickets.map(({ title }) => title);
}
