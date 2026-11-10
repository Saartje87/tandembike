import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { ValidationError } from './errors';
import type { ListedTicketSummary, TicketPage } from './tickets';

const at = (hour: number) =>
  new Date(`2026-03-01T${String(hour).padStart(2, '0')}:00:00Z`);

function numbers(page: TicketPage) {
  return page.tickets.map(({ number }) => number);
}

/** A Project with an Epic, its child and a loose Ticket, all created at 09:00. */
function setUp() {
  vi.setSystemTime(at(9));
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const epic = tickets.createTicket({
    projectId: project.id,
    title: 'Launch',
    type: 'Epic',
  });
  const child = tickets.createTicket({
    projectId: project.id,
    title: 'Header',
    epicNumber: epic.number,
  });
  const loose = tickets.createTicket({
    projectId: project.id,
    title: 'Footer',
  });
  return { tickets, project, epic, child, loose };
}

describe('Finding Tickets changed since a time', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: at(9) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists only Tickets created or changed at or after it', () => {
    const { tickets, loose } = setUp();
    vi.setSystemTime(at(11));
    tickets.addLabels(loose.number, ['bug']);
    const created = tickets.createTicket({
      projectId: loose.projectId,
      title: 'Logo',
    });

    expect(
      numbers(tickets.findTickets({ changedSince: '2026-03-01T10:00:00Z' })),
    ).toEqual([loose.number, created.number]);
    expect(
      numbers(
        tickets.findTickets({ changedSince: '2026-03-01T11:00:00.000Z' }),
      ),
    ).toEqual([loose.number, created.number]);
    expect(
      tickets.findTickets({ changedSince: '2026-03-01T11:00:00.001Z' }).total,
    ).toBe(0);
  });

  it('combines with the other filters', () => {
    const { tickets, project, epic, child, loose } = setUp();
    const other = tickets.createProject({ name: 'App' });
    vi.setSystemTime(at(11));
    tickets.createTicket({ projectId: other.id, title: 'Elsewhere' });
    tickets.updateTicket(loose.number, { status: 'In progress' });
    tickets.updateTicket(child.number, { title: 'Big header' });
    const changedSince = '2026-03-01T10:00:00Z';

    expect(
      numbers(
        tickets.findTickets({
          projectName: 'Website',
          changedSince,
          type: 'Ticket',
        }),
      ),
    ).toEqual([child.number, loose.number]);
    expect(
      numbers(
        tickets.findTickets({
          projectId: project.id,
          changedSince,
          status: 'In progress',
        }),
      ),
    ).toEqual([loose.number]);
    expect(
      numbers(tickets.findTickets({ epicNumber: epic.number, changedSince })),
    ).toEqual([child.number]);
  });

  it('accepts a timestamp with an offset', () => {
    const { tickets, loose } = setUp();
    vi.setSystemTime(at(11));
    tickets.addLabels(loose.number, ['bug']);

    expect(
      numbers(
        tickets.findTickets({
          type: 'Ticket',
          changedSince: '2026-03-01T12:30:00+02:00',
        }),
      ),
    ).toEqual([loose.number]);
  });

  describe('an Epic', () => {
    const changedSince = '2026-03-01T10:00:00Z';

    it('is unchanged when neither it nor its children changed', () => {
      const { tickets } = setUp();

      expect(
        tickets.findTickets({ type: 'Epic', changedSince }).tickets,
      ).toEqual([]);
    });

    it('matches when a child changed', () => {
      const { tickets, epic, child } = setUp();
      vi.setSystemTime(at(11));
      tickets.addLabels(child.number, ['bug']);

      expect(
        numbers(tickets.findTickets({ type: 'Epic', changedSince })),
      ).toEqual([epic.number]);
    });

    it('matches when a child was created in it', () => {
      const { tickets, project, epic } = setUp();
      vi.setSystemTime(at(11));
      tickets.createTicket({
        projectId: project.id,
        title: 'Nav',
        epicNumber: epic.number,
      });

      expect(
        numbers(tickets.findTickets({ type: 'Epic', changedSince })),
      ).toEqual([epic.number]);
    });

    it('matches when a Ticket was attached', () => {
      const { tickets, epic, loose } = setUp();
      vi.setSystemTime(at(11));
      tickets.attachTicketsToEpic({
        epic: epic.number,
        children: [loose.number],
      });

      expect(
        numbers(tickets.findTickets({ type: 'Epic', changedSince })),
      ).toEqual([epic.number]);
    });

    it('matches when a child was detached', () => {
      const { tickets, epic, child } = setUp();
      vi.setSystemTime(at(11));
      tickets.detachTicketsFromEpic([child.number]);

      expect(
        numbers(tickets.findTickets({ type: 'Epic', changedSince })),
      ).toEqual([epic.number]);
    });
  });

  it.each([
    ['text', 'yesterday'],
    ['a date-time without a zone', '2026-03-01T10:00:00'],
    ['an impossible date', '2026-02-30T10:00:00Z'],
    ['an empty string', ''],
  ])('refuses %s, naming the parameter', (_case, changedSince) => {
    const { tickets } = setUp();

    expect(errorFrom(() => tickets.findTickets({ changedSince }))).toEqual(
      new ValidationError({
        changedSince:
          'Give changedSince as an ISO 8601 timestamp with a time zone, such as 2026-11-07T23:05:00Z.',
      }),
    );
  });
});

describe('Ticket summaries', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('carry updatedAt', () => {
    vi.useFakeTimers({ now: at(9) });
    const { tickets, loose } = setUp();
    vi.setSystemTime(at(11));
    tickets.addLabels(loose.number, ['bug']);

    const rows = tickets.findTickets().tickets as ListedTicketSummary[];

    expect(rows.map(({ updatedAt }) => updatedAt)).toEqual([
      at(9),
      at(9),
      at(11),
    ]);
  });
});
