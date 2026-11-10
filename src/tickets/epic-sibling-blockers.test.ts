import { describe, expect, it } from 'vitest';

import { createTestTickets } from '../test/tickets';

/**
 * An Epic with children First and Second, First blocking Second, and a
 * Ticket Outside the Epic that First also blocks (T828).
 */
function setup() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const make = (title: string, type: 'Ticket' | 'Epic' = 'Ticket') =>
    tickets.createTicket({ projectId: project.id, title, type });
  const epic = make('Epic', 'Epic');
  const first = make('First');
  const second = make('Second');
  const outside = make('Outside');
  tickets.attachTicketsToEpic({
    epic: epic.number,
    children: [first.number, second.number],
  });
  tickets.addBlocker({ blocker: first.number, blocked: second.number });
  tickets.addBlocker({ blocker: first.number, blocked: outside.number });
  /** Claims the Epic for run-1 and starts First under it. */
  const startFirst = () => {
    tickets.startWork(epic.number, 'run-1');
    tickets.startWork(first.number, 'run-1');
  };
  return { tickets, project, epic, first, second, outside, startFirst };
}

describe('A Blocker that is an In progress sibling under the Epic Claim', () => {
  it('leaves the child it blocks unblocked in get_ticket and find_tickets', () => {
    const { tickets, project, epic, first, second, startFirst } = setup();
    startFirst();

    expect(tickets.getTicket(second.number).blocked).toBe(false);
    const unblocked = tickets
      .findTickets({ projectId: project.id, blocked: false })
      .tickets.map(({ number }) => number);
    expect(unblocked).toContain(second.number);
    const blocked = tickets
      .findTickets({ projectId: project.id, blocked: true })
      .tickets.map(({ number }) => number);
    expect(blocked).not.toContain(second.number);
    expect(
      tickets
        .getTicket(epic.number)
        .children.find(({ number }) => number === second.number)?.blocked,
    ).toBe(false);
    expect(tickets.listBlockers(second.number).blockedBy).toEqual([
      expect.objectContaining({ number: first.number, resolved: true }),
    ]);
  });

  it('keeps a Ticket outside the Epic blocked until the child is Done', () => {
    const { tickets, first, outside, startFirst } = setup();
    startFirst();

    expect(tickets.getTicket(outside.number).blocked).toBe(true);
    expect(tickets.listBlockers(outside.number).blockedBy).toEqual([
      expect.objectContaining({ number: first.number, resolved: false }),
    ]);

    tickets.updateTicket(first.number, { status: 'Done' });
    expect(tickets.getTicket(outside.number).blocked).toBe(false);
  });

  it('counts only the Ticket outside the Epic as blocked in the stats', () => {
    const { tickets, startFirst } = setup();
    startFirst();

    expect(tickets.getStats().projects[0].blocked).toBe(1);
  });

  it('blocks the child again once the Epic Claim is released', () => {
    const { tickets, epic, first, second, startFirst } = setup();
    startFirst();

    tickets.releaseTicketClaim(epic.number, { agentRunId: 'run-1' });

    expect(tickets.getTicket(first.number).status).toBe('In progress');
    expect(tickets.getTicket(second.number).blocked).toBe(true);
    expect(tickets.getStats().projects[0].blocked).toBe(2);
  });

  it('blocks the child again once the sibling is back in Todo', () => {
    const { tickets, first, second, startFirst } = setup();
    startFirst();

    tickets.backToTodo(first.number);

    expect(tickets.getTicket(second.number).blocked).toBe(true);
  });

  it('keeps a child blocked by a Todo sibling under the Epic Claim', () => {
    const { tickets, epic, second } = setup();
    tickets.startWork(epic.number, 'run-1');

    expect(tickets.getTicket(second.number).blocked).toBe(true);
  });
});
