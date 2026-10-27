// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotFoundError, ValidationError } from './errors';
import type { Status } from './status';
import type { TicketPage } from './tickets';

describe('Finding Tickets', () => {
  it('finds Ticket summaries by default', () => {
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
          labels: ['bug'],
          blocked: false,
          projectId: project.id,
        },
      ],
      nextCursor: null,
      total: 1,
    });
  });

  it('leaves the Project out of summaries filtered to one Project', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Header' });
    tickets.createTicket({ projectId: project.id, title: 'Footer' });

    const byId = tickets.findTickets({ projectId: project.id }).tickets;
    const byName = tickets.findTickets({ projectName: 'Website' }).tickets;

    expect(byId.map((row) => Object.keys(row))).toEqual([
      ['number', 'title', 'status', 'labels', 'blocked'],
      ['number', 'title', 'status', 'labels', 'blocked'],
    ]);
    expect(byName).toEqual(byId);
  });

  it('finds whole Tickets in full detail', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      description: 'It overlaps the logo.',
    });
    tickets.claimTicket(ticket.number, { agentRunId: 'run-1' });

    expect(tickets.findTickets({ detail: 'full' })).toEqual({
      tickets: [tickets.getTicket(ticket.number)],
      nextCursor: null,
      total: 1,
    });
    expect(
      tickets.findTickets({ detail: 'full', projectId: project.id }).tickets,
    ).toEqual([tickets.getTicket(ticket.number)]);
  });

  it('filters and pages the same in either detail', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    for (const title of ['Bug one', 'Chore', 'Bug two', 'Bug three']) {
      tickets.createTicket({ projectId: project.id, title });
    }
    const input = { query: 'bug', limit: 2 };

    const summary = tickets.findTickets(input);
    const full = tickets.findTickets({ ...input, detail: 'full' });

    expect([numbers(full), full.nextCursor]).toEqual([
      numbers(summary),
      summary.nextCursor,
    ]);
    expect([numbers(summary), summary.nextCursor]).toEqual([[1, 3], 3]);
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

  it('finds Tickets that have any of the External references, each once', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Both',
      externalReferences: ['#5', 'ABC-1'],
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Key',
      externalReferences: ['ABC-1'],
    });
    tickets.createTicket({ projectId: project.id, title: 'None' });

    const page = tickets.findTickets({ externalReferences: ['#5', 'ABC-1'] });

    expect([titles(page), page.total]).toEqual([['Both', 'Key'], 2]);
  });

  it('matches External references exactly, after trimming', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Short',
      externalReferences: ['#5'],
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Key',
      externalReferences: ['#55'],
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Url',
      externalReferences: ['https://github.com/o/r/issues/55'],
    });

    expect(
      titles(tickets.findTickets({ externalReferences: [' #55 '] })),
    ).toEqual(['Key']);
    expect(titles(tickets.findTickets({ externalReferences: ['#5'] }))).toEqual(
      ['Short'],
    );
    expect(
      titles(tickets.findTickets({ externalReferences: ['abc-55', '55'] })),
    ).toEqual([]);
  });

  it('combines External references with the other filters and paging', () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });
    const wanted = {
      projectId: website.id,
      title: 'Header bug',
      status: 'In progress' as const,
      labels: ['bug'],
      externalReferences: ['#7'],
    };
    tickets.createTicket(wanted);
    tickets.createTicket({ ...wanted, title: 'Footer bug' });
    tickets.createTicket({ ...wanted, title: 'Header two' });
    tickets.createTicket({ ...wanted, projectId: app.id });
    tickets.createTicket({ ...wanted, status: 'Todo' });
    tickets.createTicket({ ...wanted, labels: [] });
    tickets.createTicket({ ...wanted, externalReferences: ['#8'] });
    tickets.archiveTicket(
      tickets.createTicket({ ...wanted, title: 'Old header bug' }).number,
    );
    const filter = {
      externalReferences: ['#7'],
      query: 'header',
      projectId: website.id,
      status: 'In progress' as const,
      labels: ['bug'],
      limit: 1,
    };

    const first = tickets.findTickets(filter);
    const second = tickets.findTickets({
      ...filter,
      cursor: first.nextCursor ?? 0,
    });

    expect([titles(first), first.total]).toEqual([['Header bug'], 2]);
    expect([titles(second), second.nextCursor]).toEqual([['Header two'], null]);
    expect(
      tickets.findTickets({ ...filter, limit: 50, includeArchived: true })
        .total,
    ).toBe(3);
  });

  it.each([
    ['an empty list', []],
    ['only blank references', ['  ']],
  ])('refuses %s of External references', (_, externalReferences) => {
    const tickets = createTestTickets();

    expect(
      errorFrom(() => tickets.findTickets({ externalReferences })),
    ).toEqual(
      new ValidationError({
        externalReferences:
          'Enter a URL or key to find Tickets by, or leave externalReferences out.',
      }),
    );
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
      total: 0,
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
      { cursor: 'There is no Ticket T9 to continue after.' },
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
        cursor: 'There is no Ticket T9 to continue after.',
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

describe('Finding Tickets in several Statuses', () => {
  it('finds Tickets in any of the given Statuses, oldest-created first', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Started',
      status: 'In progress',
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Finished',
      status: 'Done',
    });
    tickets.createTicket({ projectId: project.id, title: 'Waiting' });

    expect(
      titles(tickets.findTickets({ status: ['Todo', 'In progress'] })),
    ).toEqual(['Started', 'Waiting']);
    expect(titles(tickets.findTickets({ status: 'Done' }))).toEqual([
      'Finished',
    ]);
  });

  it('pages through Tickets in several Statuses', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    for (const status of ['Todo', 'Done', 'In progress', 'Todo'] as const) {
      tickets.createTicket({ projectId: project.id, title: status, status });
    }
    const status = ['Todo', 'In progress'] as const;

    const first = tickets.findTickets({ status: [...status], limit: 2 });
    const second = tickets.findTickets({
      status: [...status],
      limit: 2,
      cursor: first.nextCursor ?? 0,
    });

    expect([numbers(first), first.nextCursor]).toEqual([[1, 3], 3]);
    expect([numbers(second), second.nextCursor]).toEqual([[4], null]);
  });

  it.each([
    ['an empty list', [], 'Choose at least one Status, or leave status out.'],
    [
      'an unknown Status',
      ['Todo', 'Blocked'],
      'Choose a Status: Todo, In progress or Done.',
    ],
  ])('refuses %s of Statuses', (_case, status, reason) => {
    const tickets = createTestTickets();

    expect(
      errorFrom(() =>
        tickets.findTickets({ status: status as unknown as Status[] }),
      ),
    ).toEqual(new ValidationError({ status: reason }));
  });
});

describe('Finding Tickets by Project name', () => {
  it('finds the Tickets of the Project with that name, ignoring case', () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });
    tickets.createTicket({ projectId: website.id, title: 'Header' });
    tickets.createTicket({ projectId: app.id, title: 'Login' });

    expect(titles(tickets.findTickets({ projectName: ' website ' }))).toEqual([
      'Header',
    ]);
    expect(
      titles(tickets.findTickets({ projectId: app.id, projectName: 'APP' })),
    ).toEqual(['Login']);
  });

  it('refuses an unknown name, naming the existing Projects', () => {
    const tickets = createTestTickets();
    tickets.createProject({ name: 'Tandembike' });
    tickets.createProject({ name: 'Website' });

    expect(
      errorFrom(() => tickets.findTickets({ projectName: 'Ticket' })),
    ).toEqual(
      new NotFoundError(
        'There is no Project named "Ticket". The Projects are: "Tandembike", "Website".',
      ),
    );
  });

  it('refuses an unknown name when there are no Projects', () => {
    const tickets = createTestTickets();

    expect(
      errorFrom(() => tickets.findTickets({ projectName: 'Ticket' })),
    ).toEqual(
      new NotFoundError(
        'There is no Project named "Ticket", and there are no Projects yet.',
      ),
    );
  });

  it('refuses a projectId and projectName that name different Projects', () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    tickets.createProject({ name: 'App' });

    expect(
      errorFrom(() =>
        tickets.findTickets({ projectId: website.id, projectName: 'App' }),
      ),
    ).toEqual(
      new ValidationError({
        projectName: `Project ${website.id} is "Website", not "App". Give projectId or projectName, or both for the same Project.`,
      }),
    );
  });
});

describe('Resolving a Project', () => {
  it('resolves a projectId, a projectName or both to the Project id', () => {
    const tickets = createTestTickets();
    tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });

    expect(tickets.resolveProjectId({ projectId: app.id })).toBe(app.id);
    expect(tickets.resolveProjectId({ projectName: 'app' })).toBe(app.id);
    expect(
      tickets.resolveProjectId({ projectId: app.id, projectName: 'App' }),
    ).toBe(app.id);
  });

  it('refuses neither a projectId nor a projectName', () => {
    const tickets = createTestTickets();

    expect(errorFrom(() => tickets.resolveProjectId({}))).toEqual(
      new ValidationError({
        projectId: 'Choose a Project by projectId or projectName.',
      }),
    );
  });
});

describe('Counting matching Tickets', () => {
  it('counts every matching Ticket across all pages, ignoring the cursor', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    for (const title of ['One', 'Two', 'Three']) {
      tickets.createTicket({ projectId: project.id, title });
    }

    const first = tickets.findTickets({ limit: 2 });
    const second = tickets.findTickets({ limit: 2, cursor: 2 });

    expect([first.tickets.length, first.total]).toEqual([2, 3]);
    expect([second.tickets.length, second.total]).toEqual([1, 3]);
  });

  it('counts 0 when nothing matches', () => {
    const tickets = createTestTickets();

    expect(tickets.findTickets().total).toBe(0);
  });

  it('counts by every filter', () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });
    const wanted = {
      projectId: website.id,
      title: 'Header bug',
      status: 'In progress' as const,
      labels: ['bug'],
    };
    const blocker = tickets.createTicket({ ...wanted, title: 'Blocker' });
    tickets.createTicket(wanted);
    const blocked = tickets.createTicket(wanted);
    tickets.addBlocker({ blocker: blocker.number, blocked: blocked.number });
    const claimed = tickets.createTicket(wanted);
    tickets.claimTicket(claimed.number, { agentRunId: 'run-1' });
    tickets.createTicket({ ...wanted, projectId: app.id });
    tickets.createTicket({ ...wanted, status: 'Done' });
    tickets.createTicket({ ...wanted, labels: [] });
    tickets.archiveTicket(tickets.createTicket(wanted).number);
    const filter = {
      projectId: website.id,
      status: ['In progress' as const],
      labels: ['bug'],
      query: 'header',
    };

    expect(tickets.findTickets(filter).total).toBe(3);
    expect(
      tickets.findTickets({ ...filter, includeArchived: true }).total,
    ).toBe(4);
    expect(tickets.findTickets({ ...filter, blocked: true }).total).toBe(1);
    expect(tickets.findTickets({ ...filter, claimed: false }).total).toBe(2);
  });
});

describe('Sorting Tickets by Board position', () => {
  /** A Project whose Board shows Todo: C, A; In progress: E, D; Done: B. */
  function boardTickets() {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const add = (title: string, status: Status) =>
      tickets.createTicket({ projectId: project.id, title, status }).number;
    const a = add('A', 'Todo');
    add('B', 'Done');
    const c = add('C', 'Todo');
    const d = add('D', 'In progress');
    const e = add('E', 'In progress');
    tickets.reorderTickets({
      projectId: project.id,
      status: 'Todo',
      ticketNumbers: [c, a],
    });
    tickets.reorderTickets({
      projectId: project.id,
      status: 'In progress',
      ticketNumbers: [e, d],
    });
    return { tickets, project };
  }

  it('lists the lanes Todo, In progress, Done, each in Board order', () => {
    const { tickets, project } = boardTickets();

    expect(
      titles(tickets.findTickets({ projectId: project.id, sort: 'position' })),
    ).toEqual(['C', 'A', 'E', 'D', 'B']);
    expect(
      titles(tickets.findTickets({ projectName: 'website', sort: 'position' })),
    ).toEqual(['C', 'A', 'E', 'D', 'B']);
  });

  it('lists oldest-created first by default', () => {
    const { tickets, project } = boardTickets();

    expect(
      titles(tickets.findTickets({ projectId: project.id, sort: 'created' })),
    ).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(titles(tickets.findTickets({ projectId: project.id }))).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
    ]);
  });

  it('pages through Board order without skipping or repeating Tickets', () => {
    const { tickets, project } = boardTickets();
    const input = {
      projectId: project.id,
      sort: 'position' as const,
      limit: 2,
    };

    const pages: string[][] = [];
    let cursor: number | undefined;
    do {
      const page = tickets.findTickets({ ...input, cursor });
      pages.push(titles(page));
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);

    expect(pages).toEqual([['C', 'A'], ['E', 'D'], ['B']]);
  });

  it('combines with the other filters, archived Tickets included', () => {
    const { tickets, project } = boardTickets();
    tickets.archiveTicket(3);
    const input = {
      projectId: project.id,
      sort: 'position' as const,
      status: ['Todo', 'In progress'] as Status[],
    };

    expect(titles(tickets.findTickets(input))).toEqual(['A', 'E', 'D']);
    expect(
      titles(tickets.findTickets({ ...input, includeArchived: true })),
    ).toEqual(['C', 'A', 'E', 'D']);
    expect(
      titles(tickets.findTickets({ ...input, query: 'd', detail: 'full' })),
    ).toEqual(['D']);
  });

  it('refuses to sort by position without a Project', () => {
    const tickets = createTestTickets();

    expect(errorFrom(() => tickets.findTickets({ sort: 'position' }))).toEqual(
      new ValidationError({
        sort: 'Sorting by position needs a Project, since Board order exists only within one: give projectId or projectName.',
      }),
    );
  });
});

function titles(page: TicketPage): string[] {
  return page.tickets.map(({ title }) => title);
}

function numbers(page: TicketPage): number[] {
  return page.tickets.map(({ number }) => number);
}
