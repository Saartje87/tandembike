// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
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
  /** A Project with a Prepared Cycle and Tickets #1 to #`count` in it. */
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

  it('refuses to newly plan a Done or archived Ticket', () => {
    const { tickets, cycle } = planningWith(2);
    tickets.updateTicket(1, { status: 'Done' });
    tickets.archiveTicket(2);

    expect(
      errorFrom(() => tickets.planTicket({ cycleId: cycle.id, number: 1 })),
    ).toEqual(
      new NotAllowedError(
        'Ticket #1 is Done. Only open Tickets can be planned into a Cycle.',
      ),
    );
    expect(
      errorFrom(() => tickets.planTicket({ cycleId: cycle.id, number: 2 })),
    ).toEqual(
      new NotAllowedError(
        'Ticket #2 is archived. Restore it before planning it into a Cycle.',
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
        'Ticket #1 is already planned into the Cycle "Beta". Remove it from that Cycle first.',
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
        `Ticket #${elsewhere.number} is in another Project. A Cycle holds only its own Project's Tickets.`,
      ),
    );
    expect(
      errorFrom(() => tickets.planTicket({ cycleId: cycle.id, number: 99 })),
    ).toEqual(new NotFoundError('There is no Ticket #99.'));
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

  it('archives an Active Cycle, leaving its Tickets as they are', () => {
    const { tickets, cycle } = activeCycle();
    const before = [1, 2, 3].map((number) => tickets.getTicket(number));

    const archived = tickets.archiveCycle(cycle.id);

    expect(archived).toEqual({
      ...cycle,
      state: 'Archived',
      ticketNumbers: [1, 2, 3],
      archivedAt: expect.any(Date),
    });
    expect([1, 2, 3].map((number) => tickets.getTicket(number))).toEqual(
      before,
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
      ticketNumbers: [1, 2, 3],
    });
  });

  it('returns its unfinished Tickets to the Backlog, to plan into a later Cycle', () => {
    const { tickets, project, cycle } = activeCycle();
    tickets.archiveCycle(cycle.id);

    expect(
      tickets
        .listTickets({ projectId: project.id, cycleId: null })
        .map(({ number }) => number),
    ).toEqual([1, 2]);

    const next = tickets.createCycle({ projectId: project.id, title: 'Next' });
    tickets.planTicket({ cycleId: next.id, number: 1 });

    expect(tickets.getCycle(next.id).ticketNumbers).toEqual([1]);
    expect(tickets.getCycle(cycle.id).ticketNumbers).toEqual([1, 2, 3]);
    expect(
      tickets.listTickets({ projectId: project.id, cycleId: null }),
    ).toHaveLength(1);
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
   * A Project whose Active Cycle "Beta" holds #1 Todo, #2 In progress, #3
   * Done and #4 archived, and whose Prepared Cycle "Launch" holds #5.
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
      ticketNumbers: [1, 2, 3, 4],
      archivedAt: expect.any(Date),
    });
    expect(tickets.getTicket(3).status).toBe('Done');
    expect(tickets.getTicket(4).archived).toBe(true);
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
