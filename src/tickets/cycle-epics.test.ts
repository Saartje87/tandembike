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

describe('Archiving a Cycle archives its finished Epics', () => {
  it('archives an Epic with children Done in the Cycle and Done outside it, and restoring brings them back', () => {
    const { tickets, cycle, epic, child } = setup();
    const e = epic('Checkout');
    const inCycle = child(e.number, 'Done', cycle.id);
    const outside = child(e.number, 'Done');
    tickets.startCycle(cycle.id);
    const changes: Change[] = [];
    tickets.subscribe((change) => changes.push(change));

    tickets.archiveCycle(cycle.id);

    expect(
      archivedOf(tickets, [e.number, inCycle.number, outside.number]),
    ).toEqual([true, true, true]);
    expect(changes).toContainEqual({
      type: 'tickets',
      numbers: expect.arrayContaining([
        e.number,
        inCycle.number,
        outside.number,
      ]),
    });
    expect(tickets.listCycles(cycle.projectId)[0].ticketNumbers).toContain(
      inCycle.number,
    );

    tickets.restoreTicket(e.number);
    expect(
      archivedOf(tickets, [e.number, inCycle.number, outside.number]),
    ).toEqual([false, false, false]);
  });

  it('archives an Epic planned in the Cycle itself, with no child in it', () => {
    const { tickets, cycle, epic, child } = setup();
    const e = epic('Checkout');
    const done = child(e.number, 'Done');
    tickets.planTicket({ cycleId: cycle.id, number: e.number });
    tickets.startCycle(cycle.id);

    tickets.archiveCycle(cycle.id);

    expect(archivedOf(tickets, [e.number, done.number])).toEqual([true, true]);
  });

  it('leaves alone an Epic without children, with an unfinished child, or not touched by the Cycle', () => {
    const { tickets, cycle, epic, child } = setup();
    const empty = epic('Empty');
    tickets.planTicket({ cycleId: cycle.id, number: empty.number });
    const unfinished = epic('Unfinished');
    child(unfinished.number, 'Done', cycle.id);
    child(unfinished.number, 'Todo');
    const untouched = epic('Untouched');
    const doneElsewhere = child(untouched.number, 'Done');
    tickets.startCycle(cycle.id);

    tickets.archiveCycle(cycle.id);

    expect(
      archivedOf(tickets, [
        empty.number,
        unfinished.number,
        untouched.number,
        doneElsewhere.number,
      ]),
    ).toEqual([false, false, false, false]);
  });

  it('counts an Epic whose only unfinished child is archived as finished', () => {
    const { tickets, cycle, epic, child } = setup();
    const e = epic('Checkout');
    const done = child(e.number, 'Done', cycle.id);
    const dropped = child(e.number, 'Todo');
    tickets.archiveTicket(dropped.number);
    tickets.startCycle(cycle.id);

    tickets.archiveCycle(cycle.id);

    expect(archivedOf(tickets, [e.number, done.number])).toEqual([true, true]);
  });

  it('applies the rule to the Cycle archived by starting another', () => {
    const { tickets, project, cycle, epic, child } = setup();
    const e = epic('Checkout');
    const done = child(e.number, 'Done', cycle.id);
    tickets.startCycle(cycle.id);
    const next = tickets.createCycle({ projectId: project.id, title: 'Next' });

    tickets.startCycle(next.id, { archiveActive: true });

    expect(archivedOf(tickets, [e.number, done.number])).toEqual([true, true]);
  });
});
