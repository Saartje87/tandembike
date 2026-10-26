// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets } from '../test/tickets';
import type { Change } from './changes';

function epicWithChildren() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const epic = tickets.createTicket({
    projectId: project.id,
    title: 'Checkout',
    type: 'Epic',
  });
  const [todo, doing, done] = (['Todo', 'In progress', 'Done'] as const).map(
    (status) =>
      tickets.createTicket({
        projectId: project.id,
        title: `Pay ${status}`,
        epicNumber: epic.number,
        status,
      }),
  );
  const changes: Change[] = [];
  tickets.subscribe((change) => changes.push(change));
  return { tickets, project, epic, todo, doing, done, changes };
}

describe('Archiving an Epic with its children', () => {
  it('archives the Epic and every child that is not archived, claimed or not, and announces them once', () => {
    const { tickets, epic, todo, doing, done, changes } = epicWithChildren();
    tickets.claimTicket(doing.number, { agentRunId: 'run-1' });
    changes.length = 0;

    tickets.archiveTicket(epic.number, { withChildren: true });

    for (const { number } of [epic, todo, doing, done]) {
      expect(tickets.getTicket(number).archived).toBe(true);
    }
    expect(changes).toEqual([
      {
        type: 'tickets',
        numbers: [epic.number, todo.number, doing.number, done.number],
      },
    ]);
  });
});

describe('Restoring an Epic', () => {
  it('brings back the children archived with it, but not one archived before it', () => {
    const { tickets, epic, todo, doing, done, changes } = epicWithChildren();
    tickets.archiveTicket(done.number);
    tickets.archiveTicket(epic.number, { withChildren: true });
    changes.length = 0;

    tickets.restoreTicket(epic.number);

    expect(tickets.getTicket(epic.number).archived).toBe(false);
    expect(tickets.getTicket(todo.number).archived).toBe(false);
    expect(tickets.getTicket(doing.number).archived).toBe(false);
    expect(tickets.getTicket(done.number).archived).toBe(true);
    expect(changes).toEqual([
      { type: 'tickets', numbers: [epic.number, todo.number, doing.number] },
    ]);
  });

  it('does not restore a child detached from it while archived', () => {
    const { tickets, epic, todo, doing } = epicWithChildren();
    tickets.archiveTicket(epic.number, { withChildren: true });
    tickets.detachFromEpic(todo.number);

    tickets.restoreTicket(epic.number);

    expect(tickets.getTicket(todo.number).archived).toBe(true);
    expect(tickets.getTicket(doing.number).archived).toBe(false);
  });

  it('brings a child back only once: archived again on its own, it stays archived', () => {
    const { tickets, epic, todo } = epicWithChildren();
    tickets.archiveTicket(epic.number, { withChildren: true });
    tickets.restoreTicket(epic.number);
    tickets.archiveTicket(todo.number);
    tickets.archiveTicket(epic.number, { withChildren: true });

    tickets.restoreTicket(epic.number);

    expect(tickets.getTicket(todo.number).archived).toBe(true);
  });
});

describe('Archiving an Epic and its children as one selection', () => {
  it('archives an Epic listed before its children, without the cascade', () => {
    const { tickets, epic, todo, doing, done } = epicWithChildren();

    tickets.archiveTickets([
      epic.number,
      todo.number,
      doing.number,
      done.number,
    ]);

    for (const { number } of [epic, todo, doing, done]) {
      expect(tickets.getTicket(number).archived).toBe(true);
    }
  });

  it('archives the children left out of the selection with the cascade, and restoring the Epic brings back all of them', () => {
    const { tickets, project, epic, todo, doing, done, changes } =
      epicWithChildren();
    const other = tickets.createTicket({
      projectId: project.id,
      title: 'Logo',
    });
    changes.length = 0;

    tickets.archiveTickets([epic.number, other.number, doing.number], {
      withChildren: true,
    });

    for (const { number } of [epic, other, todo, doing, done]) {
      expect(tickets.getTicket(number).archived).toBe(true);
    }
    expect(changes).toEqual([
      {
        type: 'tickets',
        numbers: [
          epic.number,
          other.number,
          doing.number,
          todo.number,
          done.number,
        ],
      },
    ]);

    tickets.restoreTicket(epic.number);

    for (const { number } of [epic, todo, doing, done]) {
      expect(tickets.getTicket(number).archived).toBe(false);
    }
    expect(tickets.getTicket(other.number).archived).toBe(true);
  });
});

describe('Activity of archiving an Epic with its children', () => {
  it('records each Ticket archived and restored', () => {
    const { tickets, epic, todo } = epicWithChildren();

    tickets.archiveTicket(epic.number, { withChildren: true });
    tickets.restoreTicket(epic.number);

    for (const { number } of [epic, todo]) {
      expect(
        tickets.listActivity(number).map(({ changes }) => changes),
      ).toEqual([
        [{ type: 'created' }],
        [{ type: 'archived' }],
        [{ type: 'restored' }],
      ]);
    }
  });
});
