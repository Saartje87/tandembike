// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
import { boardCycleOf } from './cycles';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';

/** A Tickets module with one Project. */
function ticketsWithProject() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  return { tickets, project };
}

describe('Cycles', () => {
  it('creates a Cycle in a Project, Prepared and with a trimmed title', () => {
    const { tickets, project } = ticketsWithProject();

    const cycle = tickets.createCycle({
      projectId: project.id,
      title: '  Launch the beta ',
    });

    expect(cycle).toEqual({
      id: expect.any(Number),
      projectId: project.id,
      title: 'Launch the beta',
      state: 'Prepared',
      ticketNumbers: [],
      createdAt: expect.any(Date),
      archivedAt: null,
    });
    expect(tickets.getCycle(cycle.id)).toEqual(cycle);
  });

  it('refuses a Cycle without a title, or in a Project that does not exist', () => {
    const { tickets, project } = ticketsWithProject();

    expect(
      errorFrom(() =>
        tickets.createCycle({ projectId: project.id, title: ' ' }),
      ),
    ).toEqual(new ValidationError({ title: 'Enter a title.' }));
    expect(
      errorFrom(() => tickets.createCycle({ projectId: 99, title: 'Beta' })),
    ).toEqual(new NotFoundError('There is no Project with id 99.'));
    expect(errorFrom(() => tickets.getCycle(99))).toEqual(
      new NotFoundError('There is no Cycle with id 99.'),
    );
  });

  it("lists a Project's Cycles oldest first, several Prepared at once", () => {
    const { tickets, project } = ticketsWithProject();
    const other = tickets.createProject({ name: 'App' });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.createCycle({ projectId: other.id, title: 'Elsewhere' });
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });

    expect(tickets.listCycles(project.id)).toEqual([beta, launch]);
    expect(errorFrom(() => tickets.listCycles(99))).toEqual(
      new NotFoundError('There is no Project with id 99.'),
    );
  });

  it('renames a Cycle by the same rules as creating one', () => {
    const { tickets, project } = ticketsWithProject();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });

    const renamed = tickets.renameCycle(cycle.id, { title: ' Public beta ' });

    expect(renamed).toEqual({ ...cycle, title: 'Public beta' });
    expect(tickets.getCycle(cycle.id)).toEqual(renamed);
    expect(
      errorFrom(() => tickets.renameCycle(cycle.id, { title: '' })),
    ).toEqual(new ValidationError({ title: 'Enter a title.' }));
    expect(errorFrom(() => tickets.renameCycle(99, { title: 'Beta' }))).toEqual(
      new NotFoundError('There is no Cycle with id 99.'),
    );
  });

  it('discards a Prepared Cycle', () => {
    const { tickets, project } = ticketsWithProject();
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });

    tickets.discardCycle(beta.id);

    expect(tickets.listCycles(project.id)).toEqual([launch]);
    expect(errorFrom(() => tickets.getCycle(beta.id))).toEqual(
      new NotFoundError(`There is no Cycle with id ${beta.id}.`),
    );
    expect(errorFrom(() => tickets.discardCycle(beta.id))).toEqual(
      new NotFoundError(`There is no Cycle with id ${beta.id}.`),
    );
  });

  it('announces each change to a Cycle', () => {
    const changes = createChangeChannel();
    const listener = vi.fn();
    changes.subscribe(listener);
    const tickets = createTestTickets(changes);
    const project = tickets.createProject({ name: 'Website' });
    listener.mockClear();

    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.renameCycle(cycle.id, { title: 'Launch' });
    tickets.discardCycle(cycle.id);

    expect(listener.mock.calls).toEqual([
      [{ type: 'cycle', id: cycle.id }],
      [{ type: 'cycle', id: cycle.id }],
      [{ type: 'cycle', id: cycle.id }],
    ]);
  });
});

describe('Planning Tickets into a Cycle', () => {
  /** A Project with a Prepared Cycle and Tickets T1 to #`count` in it. */
  function planningWith(count: number) {
    const { tickets, project } = ticketsWithProject();
    for (let index = 1; index <= count; index++) {
      tickets.createTicket({ projectId: project.id, title: `Ticket ${index}` });
    }
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    return { tickets, project, cycle };
  }

  it('adds open Tickets to a Cycle and removes them again', () => {
    const { tickets, cycle } = planningWith(3);

    tickets.planTicket({ cycleId: cycle.id, number: 3 });
    const planned = tickets.planTicket({ cycleId: cycle.id, number: 1 });

    expect(planned).toEqual({ ...cycle, ticketNumbers: [1, 3] });
    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([1, 3]);

    const unplanned = tickets.unplanTicket({ cycleId: cycle.id, number: 3 });

    expect(unplanned.ticketNumbers).toEqual([1]);
    expect(tickets.listCycles(cycle.projectId)).toEqual([unplanned]);
  });

  it('plans a Done Ticket, to record finished work in a Cycle', () => {
    const { tickets, cycle } = planningWith(1);
    tickets.updateTicket(1, { status: 'Done' });

    expect(
      tickets.planTicket({ cycleId: cycle.id, number: 1 }).ticketNumbers,
    ).toEqual([1]);
    expect(tickets.getTicket(1).status).toBe('Done');
  });

  it('refuses to newly plan an archived Ticket', () => {
    const { tickets, cycle } = planningWith(1);
    tickets.archiveTicket(1);

    expect(
      errorFrom(() => tickets.planTicket({ cycleId: cycle.id, number: 1 })),
    ).toEqual(
      new NotAllowedError(
        'Ticket T1 is archived. Restore it before planning it into a Cycle.',
      ),
    );
    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([]);
  });

  it('keeps a Ticket in one Cycle at a time', () => {
    const { tickets, project, cycle } = planningWith(1);
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.planTicket({ cycleId: cycle.id, number: 1 });

    expect(
      errorFrom(() => tickets.planTicket({ cycleId: launch.id, number: 1 })),
    ).toEqual(
      new NotAllowedError(
        'Ticket T1 is already planned into the Cycle "Beta". Remove it from that Cycle first.',
      ),
    );
    expect(tickets.planTicket({ cycleId: cycle.id, number: 1 })).toEqual(
      tickets.getCycle(cycle.id),
    );
    expect(tickets.getCycle(launch.id).ticketNumbers).toEqual([]);
  });

  it("refuses another Project's Ticket, or one that does not exist", () => {
    const { tickets, cycle } = planningWith(0);
    const other = tickets.createProject({ name: 'App' });
    const elsewhere = tickets.createTicket({
      projectId: other.id,
      title: 'Elsewhere',
    });

    expect(
      errorFrom(() =>
        tickets.planTicket({ cycleId: cycle.id, number: elsewhere.number }),
      ),
    ).toEqual(
      new NotAllowedError(
        `Ticket T${elsewhere.number} is in another Project. A Cycle holds only its own Project's Tickets.`,
      ),
    );
    expect(
      errorFrom(() => tickets.planTicket({ cycleId: cycle.id, number: 99 })),
    ).toEqual(new NotFoundError('There is no Ticket T99.'));
    expect(
      errorFrom(() => tickets.planTicket({ cycleId: 99, number: 1 })),
    ).toEqual(new NotFoundError('There is no Cycle with id 99.'));
  });

  it('keeps a member that becomes Done or is archived, and lets it be removed', () => {
    const { tickets, cycle } = planningWith(2);
    tickets.planTicket({ cycleId: cycle.id, number: 1 });
    tickets.planTicket({ cycleId: cycle.id, number: 2 });

    tickets.updateTicket(1, { status: 'Done' });
    tickets.archiveTicket(2);

    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([1, 2]);
    expect(tickets.getTicket(1).status).toBe('Done');

    tickets.unplanTicket({ cycleId: cycle.id, number: 1 });
    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([2]);
  });

  it('takes a Ticket that moves to another Project out of its Cycle', () => {
    const { tickets, cycle } = planningWith(1);
    const other = tickets.createProject({ name: 'App' });
    tickets.planTicket({ cycleId: cycle.id, number: 1 });

    tickets.updateTicket(1, { projectId: other.id });

    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([]);
  });

  it("sends a discarded Cycle's Tickets back to the Backlog", () => {
    const { tickets, project, cycle } = planningWith(1);
    tickets.planTicket({ cycleId: cycle.id, number: 1 });

    tickets.discardCycle(cycle.id);
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });

    expect(
      tickets.planTicket({ cycleId: launch.id, number: 1 }).ticketNumbers,
    ).toEqual([1]);
  });

  it("lists a Cycle's Tickets, and the Backlog's: those in no open Cycle", () => {
    const { tickets, project, cycle } = planningWith(4);
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.planTicket({ cycleId: cycle.id, number: 1 });
    tickets.planTicket({ cycleId: launch.id, number: 2 });
    tickets.updateTicket(4, { status: 'Done' });
    const numbers = (filter: Parameters<typeof tickets.listTickets>[0]) =>
      tickets.listTickets(filter).map(({ number }) => number);

    expect(numbers({ cycleId: cycle.id })).toEqual([1]);
    expect(numbers({ cycleId: launch.id })).toEqual([2]);
    expect(numbers({ projectId: project.id, cycleId: null })).toEqual([3, 4]);
    expect(
      numbers({ projectId: project.id, cycleId: null, status: 'Todo' }),
    ).toEqual([3]);
  });

  it("reorders a lane within a Cycle or the Backlog, keeping other Tickets' slots", () => {
    const { tickets, project, cycle } = planningWith(4);
    tickets.planTicket({ cycleId: cycle.id, number: 1 });
    tickets.planTicket({ cycleId: cycle.id, number: 3 });
    const todo = () =>
      tickets
        .listTickets({ projectId: project.id, status: 'Todo' })
        .sort((left, right) => left.position - right.position)
        .map(({ number }) => number);

    tickets.reorderTickets({
      projectId: project.id,
      status: 'Todo',
      cycleId: cycle.id,
      ticketNumbers: [3, 1],
    });
    expect(todo()).toEqual([3, 2, 1, 4]);

    tickets.reorderTickets({
      projectId: project.id,
      status: 'Todo',
      cycleId: null,
      ticketNumbers: [4, 2],
    });
    expect(todo()).toEqual([3, 4, 1, 2]);

    expect(
      errorFrom(() =>
        tickets.reorderTickets({
          projectId: project.id,
          status: 'Todo',
          cycleId: cycle.id,
          ticketNumbers: [1],
        }),
      ),
    ).toEqual(
      new ValidationError({
        ticketNumbers: 'Refresh the Board and try reordering again.',
      }),
    );
  });

  it('creates a Ticket straight into a Cycle of its Project', () => {
    const { tickets, project, cycle } = planningWith(0);
    const other = tickets.createProject({ name: 'App' });

    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Planned',
      cycleId: cycle.id,
    });

    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([ticket.number]);
    expect(
      errorFrom(() =>
        tickets.createTicket({
          projectId: other.id,
          title: 'Elsewhere',
          cycleId: cycle.id,
        }),
      ),
    ).toEqual(
      new NotAllowedError(
        'The Cycle "Beta" is in another Project. A Cycle holds only its own Project\'s Tickets.',
      ),
    );
    expect(tickets.listTickets({ projectId: other.id })).toEqual([]);
  });
});

describe('Starting a Cycle', () => {
  it('makes a Prepared Cycle Active, Done members and all', () => {
    const { tickets, project } = ticketsWithProject();
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const done = tickets.createTicket({
      projectId: project.id,
      title: 'Done already',
      cycleId: beta.id,
    });
    tickets.updateTicket(done.number, { status: 'Done' });

    const started = tickets.startCycle(beta.id);

    expect(started).toEqual({
      ...beta,
      state: 'Active',
      ticketNumbers: [done.number],
    });
    expect(tickets.getCycle(beta.id).state).toBe('Active');
  });

  it('refuses to start a Cycle while another in its Project is Active', () => {
    const { tickets, project } = ticketsWithProject();
    const other = tickets.createProject({ name: 'App' });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    const elsewhere = tickets.createCycle({
      projectId: other.id,
      title: 'Elsewhere',
    });
    tickets.startCycle(beta.id);

    expect(errorFrom(() => tickets.startCycle(launch.id))).toEqual(
      new NotAllowedError(
        'The Cycle "Beta" is Active. Starting another archives it, so confirm that first.',
      ),
    );
    expect(tickets.getCycle(launch.id).state).toBe('Prepared');
    expect(tickets.startCycle(elsewhere.id).state).toBe('Active');
    expect(errorFrom(() => tickets.startCycle(beta.id))).toEqual(
      new NotAllowedError('The Cycle "Beta" is Active already.'),
    );
  });

  it('keeps an Active Cycle editable, but not discardable', () => {
    const { tickets, project } = ticketsWithProject();
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    tickets.startCycle(beta.id);

    tickets.renameCycle(beta.id, { title: 'Public beta' });
    tickets.planTicket({ cycleId: beta.id, number: ticket.number });
    expect(tickets.getCycle(beta.id)).toMatchObject({
      title: 'Public beta',
      ticketNumbers: [ticket.number],
    });
    tickets.unplanTicket({ cycleId: beta.id, number: ticket.number });
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([]);

    expect(errorFrom(() => tickets.discardCycle(beta.id))).toEqual(
      new NotAllowedError(
        'The Cycle "Public beta" is Active. Only a Prepared Cycle can be discarded.',
      ),
    );
  });
});

describe('Archiving a Cycle', () => {
  /** A Project with an Active Cycle holding a Todo, a Done and an archived Ticket. */
  function activeCycle() {
    const { tickets, project } = ticketsWithProject();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    for (const title of ['Open', 'Done', 'Archived']) {
      tickets.createTicket({ projectId: project.id, title, cycleId: cycle.id });
    }
    tickets.updateTicket(2, { status: 'Done' });
    tickets.archiveTicket(3);
    tickets.startCycle(cycle.id);
    return { tickets, project, cycle };
  }

  it('archives an Active Cycle, keeping only its Done Tickets and leaving every Ticket but its Cycle as it is', () => {
    const { tickets, cycle } = activeCycle();
    const before = [1, 2, 3].map((number) => tickets.getTicket(number));

    const archived = tickets.archiveCycle(cycle.id);

    // T1 is Todo and T3 an archived Todo: unfinished, so they leave it.
    expect(archived).toEqual({
      ...cycle,
      state: 'Archived',
      ticketNumbers: [2],
      archivedAt: expect.any(Date),
    });
    expect([1, 2, 3].map((number) => tickets.getTicket(number))).toEqual(
      before.map((ticket) => ({
        ...ticket,
        cycle:
          ticket.number === 2
            ? { id: cycle.id, title: 'Beta', state: 'Archived' }
            : null,
      })),
    );
  });

  it('archives an empty Active Cycle, but not a Prepared or Archived one', () => {
    const { tickets, project } = ticketsWithProject();
    const empty = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const prepared = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.startCycle(empty.id);

    expect(tickets.archiveCycle(empty.id).state).toBe('Archived');
    expect(errorFrom(() => tickets.archiveCycle(empty.id))).toEqual(
      new NotAllowedError('The Cycle "Beta" is Archived already.'),
    );
    expect(errorFrom(() => tickets.archiveCycle(prepared.id))).toEqual(
      new NotAllowedError(
        'The Cycle "Launch" is Prepared. Only an Active Cycle can be archived; discard a Prepared one instead.',
      ),
    );
  });

  it('keeps an archived Cycle read-only', () => {
    const { tickets, project, cycle } = activeCycle();
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    tickets.archiveCycle(cycle.id);
    const readOnly = new NotAllowedError(
      'The Cycle "Beta" is Archived and cannot change.',
    );

    expect(
      errorFrom(() => tickets.renameCycle(cycle.id, { title: 'Later' })),
    ).toEqual(readOnly);
    expect(
      errorFrom(() =>
        tickets.planTicket({ cycleId: cycle.id, number: ticket.number }),
      ),
    ).toEqual(readOnly);
    expect(
      errorFrom(() => tickets.unplanTicket({ cycleId: cycle.id, number: 1 })),
    ).toEqual(readOnly);
    expect(
      errorFrom(() =>
        tickets.createTicket({
          projectId: project.id,
          title: 'B',
          cycleId: cycle.id,
        }),
      ),
    ).toEqual(readOnly);
    expect(errorFrom(() => tickets.startCycle(cycle.id))).toEqual(
      new NotAllowedError(
        'The Cycle "Beta" is Archived. Only a Prepared Cycle can be started.',
      ),
    );
    expect(errorFrom(() => tickets.discardCycle(cycle.id))).toEqual(
      new NotAllowedError(
        'The Cycle "Beta" is Archived. Only a Prepared Cycle can be discarded.',
      ),
    );
    expect(tickets.getCycle(cycle.id)).toMatchObject({
      title: 'Beta',
      ticketNumbers: [2],
    });
  });

  it('returns its unfinished Tickets to the Backlog, to plan into a later Cycle', () => {
    const { tickets, project, cycle } = activeCycle();
    tickets.archiveCycle(cycle.id);

    // T2 is Done, so it stays with the archived Cycle (T69).
    expect(
      tickets
        .listTickets({ projectId: project.id, cycleId: null })
        .map(({ number }) => number),
    ).toEqual([1]);

    const next = tickets.createCycle({ projectId: project.id, title: 'Next' });
    tickets.planTicket({ cycleId: next.id, number: 1 });

    expect(tickets.getCycle(next.id).ticketNumbers).toEqual([1]);
    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([2]);
    expect(
      tickets.listTickets({ projectId: project.id, cycleId: null }),
    ).toEqual([]);
  });

  it('lets the Project start another Cycle once it is archived', () => {
    const { tickets, project, cycle } = activeCycle();
    const next = tickets.createCycle({ projectId: project.id, title: 'Next' });
    tickets.archiveCycle(cycle.id);

    expect(tickets.startCycle(next.id).state).toBe('Active');
  });
});

describe('Starting a Cycle with rollover', () => {
  /**
   * A Project whose Active Cycle "Beta" holds T1 Todo, T2 In progress, T3
   * Done and T4 archived, and whose Prepared Cycle "Launch" holds T5.
   */
  function withActiveAndNext() {
    const { tickets, project } = ticketsWithProject();
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    for (const title of ['Todo', 'In progress', 'Done', 'Archived']) {
      tickets.createTicket({ projectId: project.id, title, cycleId: beta.id });
    }
    tickets.updateTicket(2, { status: 'In progress' });
    tickets.updateTicket(3, { status: 'Done' });
    tickets.archiveTicket(4);
    tickets.startCycle(beta.id);
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Planned',
      cycleId: launch.id,
    });
    return { tickets, project, beta, launch };
  }

  it('still refuses to start over an Active Cycle without confirmation', () => {
    const { tickets, beta, launch } = withActiveAndNext();

    expect(errorFrom(() => tickets.startCycle(launch.id))).toEqual(
      new NotAllowedError(
        'The Cycle "Beta" is Active. Starting another archives it, so confirm that first.',
      ),
    );
    expect(tickets.getCycle(beta.id).state).toBe('Active');
    expect(tickets.getCycle(launch.id)).toMatchObject({
      state: 'Prepared',
      ticketNumbers: [5],
    });
  });

  it('archives the Active Cycle and rolls its open Tickets into the started one', () => {
    const { tickets, beta, launch } = withActiveAndNext();

    const started = tickets.startCycle(launch.id, { archiveActive: true });

    expect(started).toMatchObject({
      state: 'Active',
      ticketNumbers: [1, 2, 5],
    });
    expect(tickets.getCycle(beta.id)).toMatchObject({
      state: 'Archived',
      ticketNumbers: [3],
      archivedAt: expect.any(Date),
    });
    expect(tickets.getTicket(3).status).toBe('Done');
    expect(tickets.getTicket(4).archived).toBe(true);
  });

  it('keeps a Done Ticket planned into the Active Cycle out of the rollover', () => {
    const { tickets, project, beta, launch } = withActiveAndNext();
    const finished = tickets.createTicket({
      projectId: project.id,
      title: 'Finished',
    });
    tickets.updateTicket(finished.number, { status: 'Done' });
    tickets.planTicket({ cycleId: beta.id, number: finished.number });

    tickets.startCycle(launch.id, { archiveActive: true });

    expect(tickets.getCycle(launch.id).ticketNumbers).toEqual([1, 2, 5]);
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([
      3,
      finished.number,
    ]);
  });

  it('starts as usual when confirmed with no Active Cycle', () => {
    const { tickets, project } = ticketsWithProject();
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });

    expect(tickets.startCycle(beta.id, { archiveActive: true }).state).toBe(
      'Active',
    );
  });

  it('changes nothing when the start fails', () => {
    const { tickets, beta } = withActiveAndNext();

    expect(
      errorFrom(() => tickets.startCycle(beta.id, { archiveActive: true })),
    ).toEqual(new NotAllowedError('The Cycle "Beta" is Active already.'));
    expect(tickets.getCycle(beta.id)).toMatchObject({
      state: 'Active',
      ticketNumbers: [1, 2, 3, 4],
    });
  });

  it('announces the archived Cycle and the started one', () => {
    const changes = createChangeChannel();
    const listener = vi.fn();
    changes.subscribe(listener);
    const tickets = createTestTickets(changes);
    const project = tickets.createProject({ name: 'Website' });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.startCycle(beta.id);
    listener.mockClear();

    tickets.startCycle(launch.id, { archiveActive: true });

    expect(listener.mock.calls).toEqual([
      [{ type: 'cycle', id: beta.id }],
      [{ type: 'cycle', id: launch.id }],
    ]);
  });
});

describe('Review fixes', () => {
  it('refuses to unplan a Ticket that is not in the Cycle', () => {
    const { tickets, project } = ticketsWithProject();
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.createTicket({ projectId: project.id, title: 'A' });

    expect(
      errorFrom(() => tickets.unplanTicket({ cycleId: cycle.id, number: 1 })),
    ).toEqual(
      new NotAllowedError('Ticket T1 is not planned into the Cycle "Beta".'),
    );
    expect(
      errorFrom(() => tickets.unplanTicket({ cycleId: cycle.id, number: 99 })),
    ).toEqual(new NotFoundError('There is no Ticket T99.'));
  });

  it('refuses a rollover when another Cycle is Active than the one confirmed', () => {
    const { tickets, project } = ticketsWithProject();
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.startCycle(beta.id);

    expect(
      errorFrom(() =>
        tickets.startCycle(launch.id, {
          archiveActive: true,
          activeCycleId: launch.id + 1,
        }),
      ),
    ).toEqual(
      new NotAllowedError(
        'The Active Cycle is now "Beta", not the one you confirmed archiving. Check it and try again.',
      ),
    );
    expect(tickets.getCycle(beta.id).state).toBe('Active');
    expect(
      tickets.startCycle(launch.id, {
        archiveActive: true,
        activeCycleId: beta.id,
      }).state,
    ).toBe('Active');
  });

  it('announces the Cycle a Ticket leaves when it moves Project', () => {
    const changes = createChangeChannel();
    const listener = vi.fn();
    changes.subscribe(listener);
    const tickets = createTestTickets(changes);
    const project = tickets.createProject({ name: 'Website' });
    const other = tickets.createProject({ name: 'App' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.createTicket({
      projectId: project.id,
      title: 'A',
      cycleId: cycle.id,
    });
    listener.mockClear();

    tickets.updateTicket(1, { projectId: other.id });

    expect(listener.mock.calls).toEqual([
      [{ type: 'ticket', number: 1 }],
      [{ type: 'cycle', id: cycle.id }],
    ]);
  });
});

describe('The Backlog', () => {
  /** Tickets T1 to #`count` in a Project, and a way to list its Backlog. */
  function backlogWith(count: number) {
    const { tickets, project } = ticketsWithProject();
    for (let index = 1; index <= count; index++) {
      tickets.createTicket({ projectId: project.id, title: `Ticket ${index}` });
    }
    const backlog = () =>
      tickets
        .listTickets({ projectId: project.id, cycleId: null })
        .map(({ number }) => number);
    /** Plans `numbers` into a new Cycle, then starts and archives it. */
    const archivedCycle = (title: string, numbers: number[]) => {
      const cycle = tickets.createCycle({ projectId: project.id, title });
      tickets.planTickets({ cycleId: cycle.id, ticketNumbers: numbers });
      tickets.startCycle(cycle.id, { archiveActive: true });
      tickets.archiveCycle(cycle.id);
      return cycle;
    };
    return { tickets, project, backlog, archivedCycle };
  }

  it("leaves out an Archived Cycle's finished Tickets but keeps its unfinished ones", () => {
    const { tickets, backlog, archivedCycle } = backlogWith(3);
    tickets.updateTicket(1, { status: 'Done' });

    archivedCycle('Beta', [1, 2]);

    expect(backlog()).toEqual([2, 3]);
  });

  it('keeps a Done Ticket that was never planned', () => {
    const { tickets, backlog } = backlogWith(1);
    tickets.updateTicket(1, { status: 'Done' });

    expect(backlog()).toEqual([1]);
  });

  it('keeps a Ticket finished after its Cycle was archived: it was not done in that Cycle', () => {
    const { tickets, backlog, archivedCycle } = backlogWith(1);
    const beta = archivedCycle('Beta', [1]);

    tickets.updateTicket(1, { status: 'Done' });

    expect(backlog()).toEqual([1]);
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([]);
  });

  it("shows a Done Ticket in its new Project's Backlog after a move", () => {
    const { tickets, archivedCycle } = backlogWith(1);
    tickets.updateTicket(1, { status: 'Done' });
    archivedCycle('Beta', [1]);
    const other = tickets.createProject({ name: 'App' });

    tickets.updateTicket(1, { projectId: other.id });

    expect(
      tickets
        .listTickets({ projectId: other.id, cycleId: null })
        .map(({ number }) => number),
    ).toEqual([1]);
  });

  it('leaves out finished Tickets of every Archived Cycle', () => {
    const { tickets, backlog, archivedCycle } = backlogWith(3);
    tickets.updateTicket(1, { status: 'Done' });
    tickets.updateTicket(2, { status: 'Done' });

    archivedCycle('Beta', [1]);
    archivedCycle('Launch', [2, 3]);

    expect(backlog()).toEqual([3]);
  });

  it('still shows a finished Ticket while it is planned into an open Cycle', () => {
    const { tickets, project, archivedCycle } = backlogWith(1);
    tickets.updateTicket(1, { status: 'Done' });
    archivedCycle('Beta', [1]);
    const next = tickets.createCycle({ projectId: project.id, title: 'Next' });

    tickets.planTicket({ cycleId: next.id, number: 1 });

    expect(
      tickets
        .listTickets({ projectId: project.id, cycleId: next.id })
        .map(({ number }) => number),
    ).toEqual([1]);
  });
});

describe('Open Ticket counts', () => {
  it("counts each Prepared and Active Cycle's open Tickets and the Backlog's", () => {
    const { tickets, project } = ticketsWithProject();
    for (let index = 1; index <= 6; index++) {
      tickets.createTicket({ projectId: project.id, title: `Ticket ${index}` });
    }
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    const empty = tickets.createCycle({
      projectId: project.id,
      title: 'Later',
    });
    tickets.planTickets({ cycleId: beta.id, ticketNumbers: [1, 2, 3] });
    tickets.planTickets({ cycleId: launch.id, ticketNumbers: [4] });
    tickets.startCycle(beta.id);
    tickets.updateTicket(2, { status: 'Done' });
    tickets.updateTicket(5, { status: 'Done' });
    tickets.archiveTicket(3);

    expect(tickets.openTicketCounts(project.id)).toEqual({
      backlog: 1,
      cycles: { [beta.id]: 1, [launch.id]: 1, [empty.id]: 0 },
    });
  });

  it('leaves out Archived Cycles, whose unfinished Tickets count in the Backlog', () => {
    const { tickets, project } = ticketsWithProject();
    tickets.createTicket({ projectId: project.id, title: 'Unfinished' });
    tickets.createTicket({ projectId: project.id, title: 'Finished' });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTickets({ cycleId: beta.id, ticketNumbers: [1, 2] });
    tickets.startCycle(beta.id);
    tickets.updateTicket(2, { status: 'Done' });
    tickets.archiveCycle(beta.id);

    expect(tickets.openTicketCounts(project.id)).toEqual({
      backlog: 1,
      cycles: {},
    });
  });

  it('leaves out Epics, which are not in the Lanes', () => {
    const { tickets, project } = ticketsWithProject();
    tickets.createTicket({
      projectId: project.id,
      title: 'Launch',
      type: 'Epic',
    });

    expect(tickets.openTicketCounts(project.id)).toEqual({
      backlog: 0,
      cycles: {},
    });
  });

  it("counts only the Project's own Tickets, and refuses a missing Project", () => {
    const { tickets, project } = ticketsWithProject();
    const other = tickets.createProject({ name: 'App' });
    tickets.createTicket({ projectId: other.id, title: 'Elsewhere' });

    expect(tickets.openTicketCounts(project.id)).toEqual({
      backlog: 0,
      cycles: {},
    });
    expect(errorFrom(() => tickets.openTicketCounts(99))).toEqual(
      new NotFoundError('There is no Project with id 99.'),
    );
  });
});

describe("A Ticket's Cycle", () => {
  /** A Project with Tickets T1 to #`count`. */
  function projectWith(count: number) {
    const { tickets, project } = ticketsWithProject();
    for (let index = 1; index <= count; index++) {
      tickets.createTicket({ projectId: project.id, title: `Ticket ${index}` });
    }
    /** Plans `numbers` into a new Cycle, then starts and archives it. */
    const archivedCycle = (title: string, numbers: number[]) => {
      const cycle = tickets.createCycle({ projectId: project.id, title });
      tickets.planTickets({ cycleId: cycle.id, ticketNumbers: numbers });
      tickets.startCycle(cycle.id, { archiveActive: true });
      return tickets.archiveCycle(cycle.id);
    };
    return { tickets, project, archivedCycle };
  }

  it('is the Prepared or Active Cycle the Ticket is planned into', () => {
    const { tickets, project } = projectWith(2);
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.planTicket({ cycleId: beta.id, number: 1 });
    tickets.planTicket({ cycleId: launch.id, number: 2 });
    tickets.startCycle(launch.id);

    expect(tickets.getTicket(1).cycle).toEqual({
      id: beta.id,
      title: 'Beta',
      state: 'Prepared',
    });
    expect(tickets.getTicket(2).cycle).toEqual({
      id: launch.id,
      title: 'Launch',
      state: 'Active',
    });
  });

  it('is the most recently archived Cycle that kept a Done Ticket', () => {
    const { tickets, archivedCycle } = projectWith(1);
    tickets.updateTicket(1, { status: 'Done' });
    archivedCycle('Beta', [1]);
    const launch = archivedCycle('Launch', [1]);

    expect(tickets.getTicket(1).cycle).toEqual({
      id: launch.id,
      title: 'Launch',
      state: 'Archived',
    });
  });

  it('is null in the Backlog, also for an unfinished Ticket an Archived Cycle once held', () => {
    const { tickets, project, archivedCycle } = projectWith(2);
    archivedCycle('Beta', [2]);

    expect(tickets.getTicket(1).cycle).toBeNull();
    expect(tickets.getTicket(2).cycle).toBeNull();
    expect(
      tickets.listTickets({ projectId: project.id }).map(({ cycle }) => cycle),
    ).toEqual([null, null]);
  });

  it('is null for an unfinished Ticket left in a Cycle archived before unfinished ones were dropped', () => {
    const { tickets, archivedCycle } = projectWith(1);
    tickets.updateTicket(1, { status: 'Done' });
    archivedCycle('Beta', [1]);

    tickets.updateTicket(1, { status: 'Todo' });

    expect(tickets.getTicket(1).cycle).toBeNull();
  });

  it("is null for a Done Ticket moved out of its Archived Cycle's Project", () => {
    const { tickets, archivedCycle } = projectWith(1);
    tickets.updateTicket(1, { status: 'Done' });
    archivedCycle('Beta', [1]);
    const other = tickets.createProject({ name: 'App' });

    expect(tickets.updateTicket(1, { projectId: other.id }).cycle).toBeNull();
  });

  it('agrees with the Board each Ticket shows on', () => {
    const { tickets, project, archivedCycle } = projectWith(3);
    tickets.updateTicket(1, { status: 'Done' });
    archivedCycle('Beta', [1, 2]);
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.planTicket({ cycleId: launch.id, number: 3 });
    const cycles = tickets.listCycles(project.id);

    for (const ticket of tickets.listTickets({ projectId: project.id })) {
      expect(ticket.cycle?.id ?? null).toBe(
        boardCycleOf(cycles, ticket)?.id ?? null,
      );
    }
  });

  it('is returned by every call that gives a whole Ticket', () => {
    const { tickets, project } = projectWith(1);
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const cycle = { id: beta.id, title: 'Beta', state: 'Prepared' };

    expect(
      tickets.createTicket({
        projectId: project.id,
        title: 'Planned',
        cycleId: beta.id,
      }).cycle,
    ).toEqual(cycle);
    tickets.planTicket({ cycleId: beta.id, number: 1 });
    expect(tickets.updateTicket(1, { title: 'Renamed' }).cycle).toEqual(cycle);
    expect(
      tickets.listTickets({ projectId: project.id }).map(({ cycle }) => cycle),
    ).toEqual([cycle, cycle]);
  });
});
