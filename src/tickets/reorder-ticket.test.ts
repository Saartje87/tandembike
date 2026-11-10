// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { type Change, createChangeChannel } from './changes';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';
import type { Status } from './status';

/** A Project with Tickets T1 to T`count` in Todo, in that Board order. */
function laneWith(count: number, changes = createChangeChannel()) {
  const tickets = createTestTickets(changes, 'agent');
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

describe('Moving a Ticket before or after another', () => {
  it('puts the Ticket directly before the anchor, the others keeping their order', () => {
    const { tickets, lane } = laneWith(5);

    tickets.reorderTicket(4, { before: 2 });

    expect(lane()).toEqual([1, 4, 2, 3, 5]);
  });

  it('puts the Ticket directly after the anchor', () => {
    const { tickets, lane } = laneWith(5);

    tickets.reorderTicket(1, { after: 4 });

    expect(lane()).toEqual([2, 3, 4, 1, 5]);
  });

  it('records the move in Activity as done by the actor', () => {
    const { tickets } = laneWith(3);

    tickets.reorderTicket(3, { before: 1 });
    tickets.reorderTicket(3, { after: 2 });

    expect(
      tickets
        .listActivity(3)
        .filter(({ changes }) => changes[0].type === 'reordered')
        .map(({ actor, changes }) => ({ actor, changes })),
    ).toEqual([
      { actor: 'agent', changes: [{ type: 'reordered', before: 1 }] },
      { actor: 'agent', changes: [{ type: 'reordered', after: 2 }] },
    ]);
  });

  it('records nothing and announces nothing when the Ticket is already there', () => {
    const changes = createChangeChannel();
    const { tickets, lane } = laneWith(3, changes);
    const seen: Change[] = [];
    changes.subscribe((change) => seen.push(change));

    tickets.reorderTicket(1, { before: 2 });

    expect(lane()).toEqual([1, 2, 3]);
    expect(seen).toEqual([]);
    expect(
      tickets
        .listActivity(1)
        .some(({ changes }) => changes[0].type === 'reordered'),
    ).toBe(false);
  });

  it('announces the change so open Boards update live', () => {
    const changes = createChangeChannel();
    const { tickets } = laneWith(3, changes);
    const seen: Change[] = [];
    changes.subscribe((change) => seen.push(change));

    tickets.reorderTicket(3, { before: 1 });

    expect(seen).toContainEqual({ type: 'ticket', number: 3 });
  });

  it('keeps archived Tickets in their slots', () => {
    const { tickets, lane } = laneWith(4);
    tickets.archiveTicket(2);

    tickets.reorderTicket(4, { before: 1 });

    expect(lane()).toEqual([4, 1, 3]);
    expect(
      tickets
        .findTickets({
          projectId: 1,
          status: 'Todo',
          sort: 'position',
          includeArchived: true,
        })
        .tickets.map(({ number }) => number),
    ).toEqual([4, 2, 1, 3]);
  });

  it('refuses an anchor in another Status, changing nothing', () => {
    const { tickets, lane } = laneWith(3);
    tickets.updateTicket(3, { status: 'In progress' });

    expect(errorFrom(() => tickets.reorderTicket(1, { after: 3 }))).toEqual(
      new NotAllowedError(
        'T3 is In progress, not Todo like T1. A Ticket moves only within its own Status; change its Status with update_ticket status.',
      ),
    );
    expect(lane()).toEqual([1, 2]);
  });

  it('refuses an anchor in another Project', () => {
    const { tickets, lane } = laneWith(2);
    const other = tickets.createProject({ name: 'Shop' });
    tickets.createTicket({ projectId: other.id, title: 'Elsewhere' });

    expect(errorFrom(() => tickets.reorderTicket(1, { after: 3 }))).toEqual(
      new NotAllowedError(
        'T3 is in another Project. A Ticket moves only among the Tickets of its own Project.',
      ),
    );
    expect(lane()).toEqual([1, 2]);
  });

  it('refuses the Ticket itself, a missing anchor and an archived one', () => {
    const { tickets } = laneWith(3);
    tickets.archiveTicket(3);

    expect(errorFrom(() => tickets.reorderTicket(1, { before: 1 }))).toEqual(
      new ValidationError({
        before: 'Choose another Ticket than T1 to move it next to.',
      }),
    );
    expect(errorFrom(() => tickets.reorderTicket(1, { after: 99 }))).toEqual(
      new NotFoundError('There is no Ticket T99.'),
    );
    expect(errorFrom(() => tickets.reorderTicket(1, { after: 3 }))).toEqual(
      new NotAllowedError(
        'T3 is archived and not on the Board. Move T1 next to a Ticket on the Board.',
      ),
    );
  });

  it('refuses a missing or archived Ticket', () => {
    const { tickets } = laneWith(3);
    tickets.archiveTicket(3);

    expect(errorFrom(() => tickets.reorderTicket(99, { after: 1 }))).toEqual(
      new NotFoundError('There is no Ticket T99.'),
    );
    expect(
      errorFrom(() => tickets.reorderTicket(3, { after: 1 })),
    ).toBeInstanceOf(NotAllowedError);
  });
});
