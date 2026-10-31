// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets } from '../test/tickets';
import type { Change } from './changes';

function setup() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
  const epic = (title: string) =>
    tickets.createTicket({ projectId: project.id, title, type: 'Epic' });
  const child = (
    epicNumber: number,
    status: 'Todo' | 'Done',
    cycleId?: number,
  ) =>
    tickets.createTicket({
      projectId: project.id,
      title: `Child of ${epicNumber}`,
      epicNumber,
      status,
      cycleId,
    });
  return { tickets, project, cycle, epic, child };
}

const archivedOf = (
  tickets: ReturnType<typeof setup>['tickets'],
  numbers: number[],
) => numbers.map((number) => tickets.getTicket(number).archived);

const statusOf = (
  tickets: ReturnType<typeof setup>['tickets'],
  numbers: number[],
) => numbers.map((number) => tickets.getTicket(number).status);

describe('Archiving a Cycle leaves its Epics alone', () => {
  it('keeps a finished Epic and its children live, with their Status, and announces no Tickets', () => {
    const { tickets, cycle, epic, child } = setup();
    const e = epic('Checkout');
    const inCycle = child(e.number, 'Done', cycle.id);
    const outside = child(e.number, 'Done');
    tickets.startCycle(cycle.id);
    const changes: Change[] = [];
    tickets.subscribe((change) => changes.push(change));

    tickets.archiveCycle(cycle.id);

    const numbers = [e.number, inCycle.number, outside.number];
    expect(archivedOf(tickets, numbers)).toEqual([false, false, false]);
    expect(statusOf(tickets, numbers)).toEqual(['Done', 'Done', 'Done']);
    expect(changes).not.toContainEqual(
      expect.objectContaining({ type: 'tickets' }),
    );
    expect(tickets.listCycles(cycle.projectId)[0].ticketNumbers).toContain(
      inCycle.number,
    );
  });

  it('keeps an Epic planned in the Cycle itself live', () => {
    const { tickets, cycle, epic, child } = setup();
    const e = epic('Checkout');
    const done = child(e.number, 'Done');
    tickets.planTicket({ cycleId: cycle.id, number: e.number });
    tickets.startCycle(cycle.id);

    tickets.archiveCycle(cycle.id);

    expect(archivedOf(tickets, [e.number, done.number])).toEqual([
      false,
      false,
    ]);
  });

  it('keeps a finished Epic live when the Cycle is archived by starting another', () => {
    const { tickets, project, cycle, epic, child } = setup();
    const e = epic('Checkout');
    const done = child(e.number, 'Done', cycle.id);
    tickets.startCycle(cycle.id);
    const next = tickets.createCycle({ projectId: project.id, title: 'Next' });

    tickets.startCycle(next.id, { archiveActive: true });

    expect(archivedOf(tickets, [e.number, done.number])).toEqual([
      false,
      false,
    ]);
    expect(statusOf(tickets, [e.number, done.number])).toEqual([
      'Done',
      'Done',
    ]);
  });
});
