// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestTickets } from '../test/tickets';
import type { ActivityChange } from './activity-change';
import type { TicketPage } from './tickets';

const at = (hour: number) =>
  new Date(`2026-03-01T${String(hour).padStart(2, '0')}:00:00Z`);

function numbers(page: TicketPage) {
  return page.tickets.map(({ number }) => number);
}

/**
 * A Project with Prepared Cycles "Alpha" and "Beta" and Tickets T1 to
 * #`count`, all made at 09:00; the clock then stands at 11:00.
 */
function setUp(count = 1, actor: 'user' | 'agent' = 'user') {
  vi.setSystemTime(at(9));
  const tickets = createTestTickets(undefined, actor);
  const project = tickets.createProject({ name: 'Website' });
  for (let index = 1; index <= count; index++) {
    tickets.createTicket({ projectId: project.id, title: `Ticket ${index}` });
  }
  const alpha = tickets.createCycle({ projectId: project.id, title: 'Alpha' });
  const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
  return { tickets, project, alpha, beta };
}

/** Ticket `number`'s changes after its creation, one list per entry. */
function laterActivity(
  tickets: ReturnType<typeof setUp>['tickets'],
  number: number,
): ActivityChange[][] {
  return tickets
    .listActivity(number)
    .slice(1)
    .map(({ changes }) => changes);
}

const since = '2026-03-01T10:00:00Z';

describe('Planning a Ticket counts as a change to it', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: at(9) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists a Ticket planned into a Cycle since then, and records it', () => {
    const { tickets, alpha } = setUp(2);
    vi.setSystemTime(at(11));

    tickets.planTicket({ cycleId: alpha.id, number: 1 });

    expect(numbers(tickets.findTickets({ changedSince: since }))).toEqual([1]);
    expect(
      numbers(tickets.findTickets({ cycleId: alpha.id, changedSince: since })),
    ).toEqual([1]);
    expect(tickets.getTicket(1).updatedAt).toEqual(at(11));
    expect(laterActivity(tickets, 1)).toEqual([
      [
        {
          type: 'cycle',
          from: null,
          to: { id: alpha.id, title: 'Alpha' },
        },
      ],
    ]);
  });

  it('records the planning by the actor who made it', () => {
    const { tickets, alpha } = setUp(1, 'agent');
    tickets.planTickets({ cycleId: alpha.id, ticketNumbers: [1] });

    expect(tickets.listActivity(1).at(-1)?.actor).toBe('agent');
  });

  it('lists a Ticket unplanned from a Cycle since then, and records it', () => {
    const { tickets, alpha } = setUp(2);
    tickets.planTickets({ cycleId: alpha.id, ticketNumbers: [1, 2] });
    vi.setSystemTime(at(11));

    tickets.unplanTicket({ cycleId: alpha.id, number: 1 });
    tickets.unplanTickets({ cycleId: alpha.id, ticketNumbers: [2] });

    expect(numbers(tickets.findTickets({ changedSince: since }))).toEqual([
      1, 2,
    ]);
    expect(laterActivity(tickets, 2).at(-1)).toEqual([
      { type: 'cycle', from: { id: alpha.id, title: 'Alpha' }, to: null },
    ]);
  });

  it('lists a Ticket moved between Cycles since then, with one entry naming both', () => {
    const { tickets, alpha, beta } = setUp(2);
    tickets.planTicket({ cycleId: alpha.id, number: 1 });
    vi.setSystemTime(at(11));

    tickets.moveTicketsToCycle({ cycleId: beta.id, ticketNumbers: [1, 2] });

    expect(
      numbers(tickets.findTickets({ cycleId: beta.id, changedSince: since })),
    ).toEqual([1, 2]);
    expect(laterActivity(tickets, 1)).toEqual([
      [{ type: 'cycle', from: null, to: { id: alpha.id, title: 'Alpha' } }],
      [
        {
          type: 'cycle',
          from: { id: alpha.id, title: 'Alpha' },
          to: { id: beta.id, title: 'Beta' },
        },
      ],
    ]);
    expect(laterActivity(tickets, 2)).toEqual([
      [{ type: 'cycle', from: null, to: { id: beta.id, title: 'Beta' } }],
    ]);
  });

  it('records a move to the Backlog', () => {
    const { tickets, alpha } = setUp(1);
    tickets.planTicket({ cycleId: alpha.id, number: 1 });

    tickets.moveTicketsToCycle({ cycleId: null, ticketNumbers: [1] });

    expect(laterActivity(tickets, 1).at(-1)).toEqual([
      { type: 'cycle', from: { id: alpha.id, title: 'Alpha' }, to: null },
    ]);
  });

  it('records the planning of an Epic and every child it takes along', () => {
    const { tickets, project, alpha, beta } = setUp(0);
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
    vi.setSystemTime(at(11));

    tickets.planTicket({
      cycleId: alpha.id,
      number: epic.number,
      withChildren: true,
    });
    tickets.moveTicketsToCycle({
      cycleId: beta.id,
      ticketNumbers: [epic.number],
      withChildren: true,
    });
    tickets.unplanTicket({
      cycleId: beta.id,
      number: epic.number,
      withChildren: true,
    });

    const alphaRef = { id: alpha.id, title: 'Alpha' };
    const betaRef = { id: beta.id, title: 'Beta' };
    const expected = [
      [{ type: 'cycle', from: null, to: alphaRef }],
      [{ type: 'cycle', from: alphaRef, to: betaRef }],
      [{ type: 'cycle', from: betaRef, to: null }],
    ];
    expect(laterActivity(tickets, epic.number)).toEqual(expected);
    expect(laterActivity(tickets, child.number)).toEqual(expected);
    expect(tickets.getTicket(child.number).updatedAt).toEqual(at(11));
  });
});

describe('Cycle changes that do not count as a change to a Ticket', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: at(9) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('planning or moving a Ticket into the Cycle it is in changes nothing', () => {
    const { tickets, alpha } = setUp(1);
    tickets.planTicket({ cycleId: alpha.id, number: 1 });
    vi.setSystemTime(at(11));

    tickets.planTicket({ cycleId: alpha.id, number: 1 });
    tickets.planTickets({ cycleId: alpha.id, ticketNumbers: [1] });
    tickets.moveTicketsToCycle({ cycleId: alpha.id, ticketNumbers: [1] });

    expect(numbers(tickets.findTickets({ changedSince: since }))).toEqual([]);
    expect(laterActivity(tickets, 1)).toHaveLength(1);
  });

  it('moving a Ticket in the Backlog to the Backlog changes nothing', () => {
    const { tickets } = setUp(1);
    vi.setSystemTime(at(11));

    tickets.moveTicketsToCycle({ cycleId: null, ticketNumbers: [1] });

    expect(numbers(tickets.findTickets({ changedSince: since }))).toEqual([]);
    expect(laterActivity(tickets, 1)).toEqual([]);
  });

  it('rolling unfinished Tickets over and archiving a Cycle change nothing', () => {
    const { tickets, alpha, beta } = setUp(2);
    tickets.planTickets({ cycleId: alpha.id, ticketNumbers: [1, 2] });
    tickets.startCycle(alpha.id);
    vi.setSystemTime(at(11));

    tickets.startCycle(beta.id, { archiveActive: true });
    tickets.archiveCycle(beta.id);

    expect(numbers(tickets.findTickets({ changedSince: since }))).toEqual([]);
    expect(laterActivity(tickets, 1)).toHaveLength(1);
  });
});
