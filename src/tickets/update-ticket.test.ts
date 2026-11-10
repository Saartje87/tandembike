// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { TicketsError } from './errors';

/**
 * A Project with Tickets T1 to T3 in Todo, an Epic T4, and a Prepared Cycle,
 * all by the Agent.
 */
function setup() {
  const tickets = createTestTickets(undefined, 'agent');
  const project = tickets.createProject({ name: 'Website' });
  for (const title of ['One', 'Two', 'Three']) {
    tickets.createTicket({ projectId: project.id, title });
  }
  tickets.createTicket({ projectId: project.id, title: 'Epic', type: 'Epic' });
  const cycle = tickets.createCycle({ projectId: project.id, title: 'Launch' });
  /** The types of Ticket `number`'s Activity changes, oldest first. */
  const changeTypes = (number: number) =>
    tickets
      .listActivity(number)
      .flatMap(({ changes }) => changes.map(({ type }) => type));
  return { tickets, project, cycle, changeTypes };
}

describe('Changing a Ticket fully with updateTicket', () => {
  it('applies core fields, Epic, Blockers, Cycle, Board position and archive in that order', () => {
    const { tickets, cycle, changeTypes } = setup();
    const before = changeTypes(1);

    const ticket = tickets.updateTicket(1, {
      title: 'Renamed',
      epicNumber: 4,
      addBlockers: [2],
      cycleId: cycle.id,
      after: 3,
      archived: true,
    });

    expect(ticket).toMatchObject({
      title: 'Renamed',
      epic: { number: 4 },
      blockedBy: [2],
      archived: true,
    });
    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([1]);
    expect(changeTypes(1).slice(before.length)).toEqual([
      'title',
      'epic',
      'blockedByAdded',
      'cycle',
      'reordered',
      'archived',
    ]);
  });

  it('detaches the Ticket from its Epic with epicNumber null', () => {
    const { tickets } = setup();
    tickets.updateTicket(1, { epicNumber: 4 });

    expect(tickets.updateTicket(1, { epicNumber: null }).epic).toBeNull();
  });

  it('removes Blockers', () => {
    const { tickets } = setup();
    tickets.updateTicket(1, { addBlockers: [2, 3] });

    expect(tickets.updateTicket(1, { removeBlockers: [2] }).blockedBy).toEqual([
      3,
    ]);
  });

  it('takes an Epic’s children along to a Cycle and names them', () => {
    const { tickets, cycle } = setup();
    tickets.updateTicket(2, { epicNumber: 4 });

    const epic = tickets.updateTicket(4, {
      cycleId: cycle.id,
      withChildren: true,
    });

    expect(epic.childrenMoved).toEqual([2]);
    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([2, 4]);
  });

  it('leaves the Ticket unchanged when a late step is refused', () => {
    const { tickets, cycle } = setup();

    const error = errorFrom(() =>
      tickets.updateTicket(1, {
        title: 'Renamed',
        epicNumber: 4,
        addBlockers: [2],
        cycleId: cycle.id,
        before: 99,
      }),
    );

    expect(error).toBeInstanceOf(TicketsError);
    expect(tickets.getTicket(1)).toMatchObject({
      title: 'One',
      epic: null,
      blockedBy: [],
    });
    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([]);
  });

  it('refuses withChildren without cycleId, changing nothing', () => {
    const { tickets } = setup();

    expect(
      errorFrom(() =>
        tickets.updateTicket(4, { title: 'Renamed', withChildren: true }),
      ),
    ).toEqual(
      new TicketsError(
        "withChildren takes an Epic's children along to a Cycle, so give cycleId with it.",
      ),
    );
    expect(tickets.getTicket(4).title).toBe('Epic');
  });

  it('refuses before and after together, changing nothing', () => {
    const { tickets } = setup();

    expect(
      errorFrom(() =>
        tickets.updateTicket(1, { title: 'Renamed', before: 2, after: 3 }),
      ),
    ).toEqual(
      new TicketsError(
        'Give either before or after: a Ticket lands next to one Ticket.',
      ),
    );
    expect(tickets.getTicket(1).title).toBe('One');
  });

  it('restores an archived Ticket before changing the rest', () => {
    const { tickets } = setup();
    tickets.archiveTicket(1);

    const ticket = tickets.updateTicket(1, {
      archived: false,
      title: 'Renamed',
    });

    expect(ticket).toMatchObject({ title: 'Renamed', archived: false });
  });

  it('still bumps a Ticket given no change at all', () => {
    const { tickets } = setup();
    const { updatedAt } = tickets.getTicket(1);

    expect(tickets.updateTicket(1, {}).updatedAt >= updatedAt).toBe(true);
  });
});

describe('The refusal to plan a Ticket planned into another Cycle', () => {
  it('carries the code plannedInOtherCycle with the Ticket and Cycle, and keeps its message', () => {
    const { tickets, project, cycle } = setup();
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTicket({ cycleId: cycle.id, number: 1 });

    const error = errorFrom(() =>
      tickets.planTicket({ cycleId: beta.id, number: 1 }),
    );

    expect(error).toBeInstanceOf(TicketsError);
    expect((error as TicketsError).message).toBe(
      'Ticket T1 is already planned into the Cycle "Launch". Remove it from that Cycle first.',
    );
    expect((error as TicketsError).refusal).toEqual({
      code: 'plannedInOtherCycle',
      number: 1,
      cycleTitle: 'Launch',
    });
  });

  it('carries the code in a batch failure', () => {
    const { tickets, project, cycle } = setup();
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTicket({ cycleId: cycle.id, number: 1 });

    const { failed } = tickets.planTickets({
      cycleId: beta.id,
      ticketNumbers: [1],
    });

    expect(failed[0].refusal).toEqual({
      code: 'plannedInOtherCycle',
      number: 1,
      cycleTitle: 'Launch',
    });
  });
});
