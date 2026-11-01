// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';
import type { Status } from './status';

/** A Project with Tickets T1 to T`count` in Todo, in that Board order. */
function laneWith(count: number, changes = createChangeChannel()) {
  const tickets = createTestTickets(changes);
  const project = tickets.createProject({ name: 'Website' });
  for (let index = 1; index <= count; index++) {
    tickets.createTicket({ projectId: project.id, title: `Ticket ${index}` });
  }
  /** The numbers in the `status` lane, in Board order. */
  const lane = (status: Status = 'Todo') =>
    tickets
      .findTickets({ projectId: project.id, status, sort: 'position' })
      .tickets.map(({ number }) => number);
  return { tickets, project, lane };
}

describe('Sorting a lane', () => {
  it('puts the listed Tickets on top in the order given, the rest below in their order', () => {
    const { tickets, project, lane } = laneWith(5);

    const order = tickets.sortLane({
      projectId: project.id,
      status: 'Todo',
      ticketNumbers: [4, 2],
    });

    expect(lane()).toEqual([4, 2, 1, 3, 5]);
    expect(order).toEqual([4, 2, 1, 3, 5]);
  });

  it("sorts only a Cycle's Board, or the Backlog, leaving other Tickets' slots", () => {
    const { tickets, project, lane } = laneWith(6);
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTickets({ cycleId: cycle.id, ticketNumbers: [2, 4, 6] });

    expect(
      tickets.sortLane({
        projectId: project.id,
        status: 'Todo',
        cycleId: cycle.id,
        ticketNumbers: [6],
      }),
    ).toEqual([6, 2, 4]);
    expect(lane()).toEqual([1, 6, 3, 2, 5, 4]);

    expect(
      tickets.sortLane({
        projectId: project.id,
        status: 'Todo',
        cycleId: null,
        ticketNumbers: [5, 3],
      }),
    ).toEqual([5, 3, 1]);
    expect(lane()).toEqual([5, 6, 3, 2, 1, 4]);
  });

  it('keeps archived Tickets in their slots', () => {
    const { tickets, project, lane } = laneWith(4);
    tickets.archiveTicket(2);

    tickets.sortLane({
      projectId: project.id,
      status: 'Todo',
      ticketNumbers: [4],
    });

    expect(
      tickets
        .findTickets({
          projectId: project.id,
          sort: 'position',
          includeArchived: true,
        })
        .tickets.map(({ number }) => number),
    ).toEqual([4, 2, 1, 3]);
    expect(lane()).toEqual([4, 1, 3]);
  });

  it("sorts Epics too, never changing a Ticket's Status, Claim or Cycle", () => {
    const { tickets, project, lane } = laneWith(2);
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTicket({ cycleId: cycle.id, number: 1 });
    tickets.claimTicket(1, { agentRunId: 'run-1' });
    const before = tickets.getTicket(1);
    const activity = tickets.listActivity(1);

    tickets.sortLane({
      projectId: project.id,
      status: 'Todo',
      ticketNumbers: [epic.number, 2],
    });

    expect(lane()).toEqual([epic.number, 2, 1]);
    const after = tickets.getTicket(1);
    expect(after.status).toBe('Todo');
    expect(after.claim).toEqual(before.claim);
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(tickets.listCycles(project.id)[0].ticketNumbers).toEqual([1]);
    expect(tickets.listActivity(1)).toEqual(activity);
  });

  it('announces each Ticket that moves, so the Board updates live', () => {
    const changes = createChangeChannel();
    const { tickets, project } = laneWith(3, changes);
    const seen: unknown[] = [];
    changes.subscribe((change) => seen.push(change));

    tickets.sortLane({
      projectId: project.id,
      status: 'Todo',
      ticketNumbers: [3],
    });

    expect(seen).toEqual(
      expect.arrayContaining([
        { type: 'ticket', number: 1 },
        { type: 'ticket', number: 2 },
        { type: 'ticket', number: 3 },
      ]),
    );
  });

  it('refuses the whole call, naming the Ticket, when a listed Ticket is not in the scope', () => {
    const { tickets, project, lane } = laneWith(4);
    const other = tickets.createProject({ name: 'App' });
    const elsewhere = tickets.createTicket({
      projectId: other.id,
      title: 'Elsewhere',
    });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTicket({ cycleId: cycle.id, number: 1 });
    tickets.archiveTicket(2);
    tickets.updateTicket(3, { status: 'In progress' });
    const sort = (ticketNumbers: number[], cycleId?: number | null) =>
      errorFrom(() =>
        tickets.sortLane({
          projectId: project.id,
          status: 'Todo',
          ticketNumbers,
          ...(cycleId === undefined ? {} : { cycleId }),
        }),
      );
    const refused = (reason: string) =>
      new ValidationError({ ticketNumbers: reason });

    expect(sort([4, 99])).toEqual(new NotFoundError('There is no Ticket T99.'));
    expect(sort([4, elsewhere.number])).toEqual(
      refused(`Ticket T${elsewhere.number} is not in this Project.`),
    );
    expect(sort([4, 2])).toEqual(
      refused('Ticket T2 is archived. Restore it before sorting it.'),
    );
    expect(sort([4, 3])).toEqual(
      refused(
        'Ticket T3 is In progress, not Todo. Sorting a lane never changes a Status.',
      ),
    );
    expect(sort([4], cycle.id)).toEqual(
      refused('Ticket T4 is not in the Cycle "Beta".'),
    );
    expect(sort([4, 1], null)).toEqual(
      refused('Ticket T1 is in a Cycle, not the Backlog.'),
    );
    expect(sort([4, 4])).toEqual(
      refused('Choose each Ticket once: T4 is given twice.'),
    );
    expect(sort([])).toEqual(refused('Choose at least one Ticket.'));
    expect(lane()).toEqual([1, 4]);
  });

  it('refuses a Cycle that is missing or in another Project, and an archived Project', () => {
    const { tickets, project } = laneWith(1);
    const other = tickets.createProject({ name: 'App' });
    const elsewhere = tickets.createCycle({
      projectId: other.id,
      title: 'Gamma',
    });
    const sort = (cycleId: number, projectId = project.id) =>
      errorFrom(() =>
        tickets.sortLane({
          projectId,
          status: 'Todo',
          cycleId,
          ticketNumbers: [1],
        }),
      );

    expect(sort(999)).toEqual(
      new NotFoundError('There is no Cycle with id 999.'),
    );
    expect(sort(elsewhere.id)).toEqual(
      new NotAllowedError(
        'The Cycle "Gamma" is in another Project. Sort a lane of its own Project.',
      ),
    );
    tickets.archiveProject(project.id);
    expect(
      errorFrom(() =>
        tickets.sortLane({
          projectId: project.id,
          status: 'Todo',
          ticketNumbers: [1],
        }),
      ),
    ).toBeInstanceOf(NotAllowedError);
  });
});
