// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets } from '../test/tickets';

function setup() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
  const ticket = (status: 'Todo' | 'In progress' | 'Done', type?: 'Epic') =>
    tickets.createTicket({
      projectId: project.id,
      title: 'Work',
      status,
      type,
      cycleId: cycle.id,
    });
  return { tickets, project, cycle, ticket };
}

describe('Cycle completeness', () => {
  it('is complete when the Active Cycle has Tickets and all are Done', () => {
    const { tickets, cycle, ticket } = setup();
    ticket('Done');
    ticket('Done');
    tickets.startCycle(cycle.id);

    expect(tickets.isCycleComplete(cycle.id)).toBe(true);
  });

  it.each(['Todo', 'In progress'] as const)(
    'is not complete with a %s Ticket',
    (status) => {
      const { tickets, cycle, ticket } = setup();
      ticket('Done');
      ticket(status);
      tickets.startCycle(cycle.id);

      expect(tickets.isCycleComplete(cycle.id)).toBe(false);
    },
  );

  it('is not complete when empty', () => {
    const { tickets, cycle } = setup();
    tickets.startCycle(cycle.id);

    expect(tickets.isCycleComplete(cycle.id)).toBe(false);
  });

  it('is not complete when only archived Tickets are planned', () => {
    const { tickets, cycle, ticket } = setup();
    tickets.archiveTicket(ticket('Done').number);
    tickets.startCycle(cycle.id);

    expect(tickets.isCycleComplete(cycle.id)).toBe(false);
  });

  it('ignores an archived Ticket that is not Done', () => {
    const { tickets, cycle, ticket } = setup();
    ticket('Done');
    tickets.archiveTicket(ticket('Todo').number);
    tickets.startCycle(cycle.id);

    expect(tickets.isCycleComplete(cycle.id)).toBe(true);
  });

  it('counts an Epic by its children', () => {
    const { tickets, project, cycle, ticket } = setup();
    const epic = ticket('Todo', 'Epic');
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Child',
      epicNumber: epic.number,
      cycleId: cycle.id,
    });
    tickets.startCycle(cycle.id);
    expect(tickets.isCycleComplete(cycle.id)).toBe(false);

    tickets.updateTicket(child.number, { status: 'Done' });

    expect(tickets.isCycleComplete(cycle.id)).toBe(true);
  });

  it('is never complete for a Prepared or an Archived Cycle', () => {
    const { tickets, cycle, ticket } = setup();
    ticket('Done');
    expect(tickets.isCycleComplete(cycle.id)).toBe(false);

    tickets.startCycle(cycle.id);
    tickets.archiveCycle(cycle.id);

    expect(tickets.isCycleComplete(cycle.id)).toBe(false);
  });
});
