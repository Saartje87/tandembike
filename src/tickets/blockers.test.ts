// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
import { NotFoundError, ValidationError } from './errors';

/** A Tickets module with one Project and Tickets #1 to #`count`. */
function ticketsWith(count: number) {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  for (let index = 1; index <= count; index++) {
    tickets.createTicket({ projectId: project.id, title: `Ticket ${index}` });
  }
  return { tickets, project };
}

describe('Blockers', () => {
  it('gives a new Ticket no Blockers', () => {
    const { tickets } = ticketsWith(1);

    expect(tickets.getTicket(1)).toMatchObject({
      blockedBy: [],
      blocked: false,
    });
  });

  it('adds a Blocker, which blocks the Ticket until it is resolved', () => {
    const { tickets } = ticketsWith(2);

    const blocked = tickets.addBlocker({ blocker: 1, blocked: 2 });

    expect(blocked).toMatchObject({ number: 2, blockedBy: [1], blocked: true });
    expect(tickets.getTicket(2)).toMatchObject({
      blockedBy: [1],
      blocked: true,
    });
    expect(tickets.getTicket(1)).toMatchObject({
      blockedBy: [],
      blocked: false,
    });
  });

  it('stops blocking a Ticket once every Blocker is Done or archived', () => {
    const { tickets } = ticketsWith(3);
    tickets.addBlocker({ blocker: 1, blocked: 3 });
    tickets.addBlocker({ blocker: 2, blocked: 3 });

    tickets.updateTicket(1, { status: 'Done' });
    expect(tickets.getTicket(3)).toMatchObject({
      blockedBy: [1, 2],
      blocked: true,
    });

    tickets.archiveTicket(2);
    expect(tickets.getTicket(3)).toMatchObject({
      blockedBy: [1, 2],
      blocked: false,
    });
  });

  it('keeps Blockers while a Ticket is archived, so restoring brings them back', () => {
    const { tickets } = ticketsWith(2);
    tickets.addBlocker({ blocker: 1, blocked: 2 });

    tickets.archiveTicket(2);
    tickets.archiveTicket(1);
    tickets.restoreTicket(1);
    const restored = tickets.restoreTicket(2);

    expect(restored).toMatchObject({ blockedBy: [1], blocked: true });
  });

  it('adds a Blocker once, however often it is added', () => {
    const { tickets } = ticketsWith(2);

    tickets.addBlocker({ blocker: 1, blocked: 2 });
    const blocked = tickets.addBlocker({ blocker: 1, blocked: 2 });

    expect(blocked.blockedBy).toEqual([1]);
  });

  it('lets a Blocker be in another Project', () => {
    const { tickets } = ticketsWith(1);
    const app = tickets.createProject({ name: 'App' });
    tickets.createTicket({ projectId: app.id, title: 'Elsewhere' });

    expect(tickets.addBlocker({ blocker: 2, blocked: 1 }).blockedBy).toEqual([
      2,
    ]);
  });

  it('refuses a Ticket as its own Blocker', () => {
    const { tickets } = ticketsWith(1);

    expect(
      errorFrom(() => tickets.addBlocker({ blocker: 1, blocked: 1 })),
    ).toEqual(
      new ValidationError({ blocker: 'A Ticket cannot block itself.' }),
    );
  });

  it('refuses a Blocker that would make a cycle, naming it', () => {
    const { tickets } = ticketsWith(3);
    tickets.addBlocker({ blocker: 1, blocked: 2 });
    tickets.addBlocker({ blocker: 2, blocked: 3 });

    expect(
      errorFrom(() => tickets.addBlocker({ blocker: 3, blocked: 1 })),
    ).toEqual(
      new ValidationError({
        blocker:
          '#3 cannot block #1, because #1 already blocks #3: #1 → #2 → #3.',
      }),
    );
    expect(
      errorFrom(() => tickets.addBlocker({ blocker: 2, blocked: 1 })),
    ).toEqual(
      new ValidationError({
        blocker: '#2 cannot block #1, because #1 already blocks #2: #1 → #2.',
      }),
    );
    expect(tickets.getTicket(1).blockedBy).toEqual([]);
  });

  it('refuses a Blocker for a Ticket that does not exist', () => {
    const { tickets } = ticketsWith(1);

    expect(
      errorFrom(() => tickets.addBlocker({ blocker: 7, blocked: 1 })),
    ).toEqual(new NotFoundError('There is no Ticket #7.'));
    expect(
      errorFrom(() => tickets.addBlocker({ blocker: 1, blocked: 7 })),
    ).toEqual(new NotFoundError('There is no Ticket #7.'));
    expect(tickets.getTicket(1).updatedAt).toEqual(
      tickets.getTicket(1).createdAt,
    );
  });

  it('removes a Blocker, ignoring one the Ticket does not have', () => {
    const { tickets } = ticketsWith(3);
    tickets.addBlocker({ blocker: 1, blocked: 3 });
    tickets.addBlocker({ blocker: 2, blocked: 3 });

    tickets.removeBlocker({ blocker: 1, blocked: 3 });
    const unblocked = tickets.removeBlocker({ blocker: 1, blocked: 3 });

    expect(unblocked).toMatchObject({ number: 3, blockedBy: [2] });
    expect(
      errorFrom(() => tickets.removeBlocker({ blocker: 1, blocked: 7 })),
    ).toEqual(new NotFoundError('There is no Ticket #7.'));
  });

  it('refuses to remove a Blocker that does not exist, and changes nothing', () => {
    const changes = createChangeChannel();
    const tickets = createTestTickets(changes);
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'Ticket 1' });
    tickets.createTicket({ projectId: project.id, title: 'Ticket 2' });
    const before = tickets.addBlocker({ blocker: 1, blocked: 2 });
    const listener = vi.fn();
    changes.subscribe(listener);

    expect(
      errorFrom(() => tickets.removeBlocker({ blocker: 99, blocked: 2 })),
    ).toEqual(new NotFoundError('There is no Ticket #99.'));
    expect(tickets.getTicket(2)).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('names the blocker first when neither Ticket exists, as adding does', () => {
    const { tickets } = ticketsWith(0);

    expect(
      errorFrom(() => tickets.removeBlocker({ blocker: 98, blocked: 99 })),
    ).toEqual(new NotFoundError('There is no Ticket #98.'));
    expect(
      errorFrom(() => tickets.addBlocker({ blocker: 98, blocked: 99 })),
    ).toEqual(new NotFoundError('There is no Ticket #98.'));
  });

  it('removes an archived Blocker', () => {
    const { tickets } = ticketsWith(2);
    tickets.addBlocker({ blocker: 1, blocked: 2 });
    tickets.archiveTicket(1);

    expect(tickets.removeBlocker({ blocker: 1, blocked: 2 })).toMatchObject({
      number: 2,
      blockedBy: [],
    });
  });

  it('lists the Tickets a Ticket is blocked by and the Tickets it blocks', () => {
    const { tickets, project } = ticketsWith(4);
    tickets.addBlocker({ blocker: 1, blocked: 2 });
    tickets.addBlocker({ blocker: 3, blocked: 2 });
    tickets.addBlocker({ blocker: 2, blocked: 4 });
    tickets.updateTicket(3, { status: 'Done' });

    expect(tickets.listBlockers(2)).toEqual({
      blockedBy: [
        {
          number: 1,
          title: 'Ticket 1',
          status: 'Todo',
          projectId: project.id,
          archived: false,
          resolved: false,
        },
        {
          number: 3,
          title: 'Ticket 3',
          status: 'Done',
          projectId: project.id,
          archived: false,
          resolved: true,
        },
      ],
      blocks: [
        {
          number: 4,
          title: 'Ticket 4',
          status: 'Todo',
          projectId: project.id,
          archived: false,
          resolved: false,
        },
      ],
    });
    expect(errorFrom(() => tickets.listBlockers(7))).toEqual(
      new NotFoundError('There is no Ticket #7.'),
    );
  });

  it('announces a Blocker change for both Tickets', () => {
    const changes = createChangeChannel();
    const tickets = createTestTickets(changes);
    const project = tickets.createProject({ name: 'Website' });
    tickets.createTicket({ projectId: project.id, title: 'One' });
    tickets.createTicket({ projectId: project.id, title: 'Two' });
    const listener = vi.fn();
    changes.subscribe(listener);

    tickets.addBlocker({ blocker: 1, blocked: 2 });
    tickets.removeBlocker({ blocker: 1, blocked: 2 });

    expect(listener.mock.calls).toEqual([
      [{ type: 'tickets', numbers: [1, 2] }],
      [{ type: 'tickets', numbers: [1, 2] }],
    ]);
  });

  it('finds Tickets by whether they are blocked, to pick ready work', () => {
    const { tickets } = ticketsWith(4);
    tickets.addBlocker({ blocker: 1, blocked: 2 });
    tickets.addBlocker({ blocker: 3, blocked: 4 });
    tickets.updateTicket(3, { status: 'Done' });

    const numbers = (blocked: boolean) =>
      tickets
        .findTickets({ status: 'Todo', blocked })
        .tickets.map((ticket) => ticket.number);

    expect(numbers(false)).toEqual([1, 4]);
    expect(numbers(true)).toEqual([2]);
    expect(
      tickets.listTickets({ blocked: true }).map((ticket) => ticket.number),
    ).toEqual([2]);
  });
});
