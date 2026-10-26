// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
import { ValidationError } from './errors';
import type { Status } from './status';

function ticketsWithLanes() {
  const changes = createChangeChannel();
  const tickets = createTestTickets(changes);
  const project = tickets.createProject({ name: 'Website' });
  const create = (title: string, status: Status = 'Todo') =>
    tickets.createTicket({ projectId: project.id, title, status }).number;
  const [a, b, c] = ['A', 'B', 'C'].map((title) => create(title));
  const [x, y] = ['X', 'Y'].map((title) => create(title, 'In progress'));
  const lane = (status: Status) =>
    tickets
      .listTickets({ projectId: project.id, status })
      .sort((left, right) => left.position - right.position)
      .map(({ number }) => number);
  return { tickets, changes, project, create, lane, a, b, c, x, y };
}

describe('Moving several Tickets into a Status lane at once', () => {
  it('puts them next to each other before the given Ticket, in the order given, with that Status', () => {
    const { tickets, project, lane, a, b, c, x, y } = ticketsWithLanes();

    tickets.moveTickets({
      projectId: project.id,
      ticketNumbers: [c, a],
      status: 'In progress',
      before: y,
    });

    expect(lane('In progress')).toEqual([x, c, a, y]);
    expect(lane('Todo')).toEqual([b]);
  });

  it('puts them at the end of the lane without a Ticket to land before', () => {
    const { tickets, project, lane, a, b, c, x, y } = ticketsWithLanes();

    tickets.moveTickets({
      projectId: project.id,
      ticketNumbers: [a, b],
      status: 'In progress',
      before: null,
    });

    expect(lane('In progress')).toEqual([x, y, a, b]);
    expect(lane('Todo')).toEqual([c]);
  });

  it('gathers Tickets already in the lane at the drop point', () => {
    const { tickets, project, lane, a, b, c, x, y } = ticketsWithLanes();

    tickets.moveTickets({
      projectId: project.id,
      ticketNumbers: [a, x],
      status: 'Todo',
      before: c,
    });

    expect(lane('Todo')).toEqual([b, a, x, c]);
    expect(lane('In progress')).toEqual([y]);
  });

  it('moves none of them when one cannot move, naming it', () => {
    const { tickets, project, lane, a, b, c, x, y } = ticketsWithLanes();
    tickets.archiveTicket(b);

    expect(
      errorFrom(() =>
        tickets.moveTickets({
          projectId: project.id,
          ticketNumbers: [a, b],
          status: 'In progress',
          before: null,
        }),
      ),
    ).toEqual(
      new ValidationError({
        ticketNumbers: `Ticket T${b} is archived. Restore it before moving it.`,
      }),
    );
    expect(lane('Todo')).toEqual([a, c]);
    expect(lane('In progress')).toEqual([x, y]);
  });

  it('refuses a Ticket to land before that is no longer in the lane', () => {
    const { tickets, project, lane, a, b, c, x, y } = ticketsWithLanes();

    expect(
      errorFrom(() =>
        tickets.moveTickets({
          projectId: project.id,
          ticketNumbers: [a],
          status: 'In progress',
          before: b,
        }),
      ),
    ).toEqual(
      new ValidationError({
        before: 'Refresh the Board and try moving the Tickets again.',
      }),
    );
    expect(lane('Todo')).toEqual([a, b, c]);
    expect(lane('In progress')).toEqual([x, y]);
  });

  it('refuses Tickets of another Project and Epics', () => {
    const { tickets, project, a } = ticketsWithLanes();
    const other = tickets.createProject({ name: 'App' });
    const elsewhere = tickets.createTicket({
      projectId: other.id,
      title: 'Elsewhere',
    }).number;
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Epic',
      type: 'Epic',
    }).number;

    expect(
      errorFrom(() =>
        tickets.moveTickets({
          projectId: project.id,
          ticketNumbers: [a, elsewhere],
          status: 'Done',
          before: null,
        }),
      ),
    ).toEqual(
      new ValidationError({
        ticketNumbers: `Ticket T${elsewhere} is not in this Project.`,
      }),
    );
    expect(
      errorFrom(() =>
        tickets.moveTickets({
          projectId: project.id,
          ticketNumbers: [epic],
          status: 'Done',
          before: null,
        }),
      ),
    ).toEqual(
      new ValidationError({
        ticketNumbers: `Ticket T${epic} is an Epic. Its Status follows its child Tickets and cannot be set by hand.`,
      }),
    );
  });

  it('releases Claims and updates an Epic when its children reach Done', () => {
    const { tickets, project, a } = ticketsWithLanes();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Epic',
      type: 'Epic',
    }).number;
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Child',
      epicNumber: epic,
    }).number;
    tickets.claimTicket(a, { agentRunId: 'run-1' });

    tickets.moveTickets({
      projectId: project.id,
      ticketNumbers: [a, child],
      status: 'Done',
      before: null,
    });

    expect(tickets.getTicket(a).claim).toBeNull();
    expect(tickets.getTicket(epic).status).toBe('Done');
  });

  it('announces the moved Tickets and changed Epics once', () => {
    const { tickets, changes, project, a, b } = ticketsWithLanes();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Epic',
      type: 'Epic',
    }).number;
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Child',
      epicNumber: epic,
    }).number;
    const listener = vi.fn();
    changes.subscribe(listener);

    tickets.moveTickets({
      projectId: project.id,
      ticketNumbers: [b, child, a],
      status: 'Done',
      before: null,
    });

    expect(listener.mock.calls).toEqual([
      [{ type: 'tickets', numbers: [b, child, a, epic] }],
    ]);
  });
});
