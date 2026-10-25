// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
import { NotAllowedError, NotFoundError } from './errors';

/** A Tickets module with one Project and Tickets #1 to #`count`. */
function ticketsWith(count: number) {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  for (let index = 1; index <= count; index++) {
    tickets.createTicket({ projectId: project.id, title: `Ticket ${index}` });
  }
  return { tickets, project };
}

describe('Deleting a Ticket', () => {
  it('destroys it for good and never reuses its number', () => {
    const { tickets, project } = ticketsWith(2);

    tickets.deleteTicket(2);
    const next = tickets.createTicket({ projectId: project.id, title: 'Next' });

    expect(errorFrom(() => tickets.getTicket(2))).toEqual(
      new NotFoundError('There is no Ticket #2.'),
    );
    expect(next.number).toBe(3);
    expect(
      tickets
        .listTickets({ projectId: project.id })
        .map(({ number }) => number),
    ).toEqual([1, 3]);
  });

  it('takes its labels, Comments and acceptance criteria with it', () => {
    const { tickets, project } = ticketsWith(0);
    const doomed = tickets.createTicket({
      projectId: project.id,
      title: 'Doomed',
      labels: ['only-here', 'shared'],
      acceptanceCriteria: [{ text: 'It works' }],
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Kept',
      labels: ['shared'],
    });
    tickets.addComment(doomed.number, { body: 'A note', author: 'user' });

    tickets.deleteTicket(doomed.number);

    expect(tickets.listLabels()).toEqual(['shared']);
    expect(errorFrom(() => tickets.listComments(doomed.number))).toEqual(
      new NotFoundError(`There is no Ticket #${doomed.number}.`),
    );
  });

  it('removes its Blockers on both sides and bumps the Tickets it blocked', () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T09:00:00Z') });
    try {
      const { tickets } = ticketsWith(3);
      tickets.addBlocker({ blocker: 1, blocked: 2 });
      tickets.addBlocker({ blocker: 2, blocked: 3 });
      vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));

      tickets.deleteTicket(2);

      expect(tickets.getTicket(3)).toMatchObject({
        blockedBy: [],
        blocked: false,
        updatedAt: new Date('2026-03-01T10:00:00Z'),
      });
      expect(tickets.listBlockers(1).blocks).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves every Cycle, an Archived Cycle's history included", () => {
    const { tickets, project } = ticketsWith(2);
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTickets({ cycleId: beta.id, ticketNumbers: [1, 2] });
    tickets.startCycle(beta.id);
    tickets.archiveCycle(beta.id);
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.planTicket({ cycleId: launch.id, number: 1 });

    tickets.deleteTicket(1);

    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([2]);
    expect(tickets.getCycle(launch.id).ticketNumbers).toEqual([]);
  });

  it("takes a child out of its Epic and recalculates the Epic's Status", () => {
    const { tickets, project } = ticketsWith(0);
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Launch',
      type: 'Epic',
    });
    const [done, open] = ['Done', 'Open'].map((title) =>
      tickets.createTicket({
        projectId: project.id,
        title,
        epicNumber: epic.number,
      }),
    );
    tickets.updateTicket(done.number, { status: 'Done' });
    expect(tickets.getTicket(epic.number).status).toBe('In progress');

    tickets.deleteTicket(open.number);

    expect(tickets.getTicket(epic.number)).toMatchObject({
      status: 'Done',
      children: [{ number: done.number }],
    });
  });

  it('refuses an Epic that still has children, archived ones included', () => {
    const { tickets, project } = ticketsWith(0);
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Launch',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Child',
      epicNumber: epic.number,
    });
    tickets.archiveTicket(child.number);
    const before = tickets.getTicket(epic.number);

    expect(errorFrom(() => tickets.deleteTicket(epic.number))).toEqual(
      new NotAllowedError(
        `Epic #${epic.number} still has children. Detach them before deleting it.`,
      ),
    );
    expect(tickets.getTicket(epic.number)).toEqual(before);

    tickets.detachFromEpic(child.number);
    tickets.deleteTicket(epic.number);

    expect(errorFrom(() => tickets.getTicket(epic.number))).toEqual(
      new NotFoundError(`There is no Ticket #${epic.number}.`),
    );
  });

  it('announces the Tickets and Cycles it touched, and nothing when refused', () => {
    const changes = createChangeChannel();
    const tickets = createTestTickets(changes);
    const project = tickets.createProject({ name: 'Website' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Launch',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Child',
      epicNumber: epic.number,
    });
    const blocked = tickets.createTicket({
      projectId: project.id,
      title: 'Blocked',
    });
    tickets.addBlocker({ blocker: child.number, blocked: blocked.number });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    tickets.planTicket({ cycleId: cycle.id, number: child.number });
    const listener = vi.fn();
    changes.subscribe(listener);

    errorFrom(() => tickets.deleteTicket(epic.number));
    tickets.deleteTicket(child.number);

    expect(listener.mock.calls).toEqual([
      [
        {
          type: 'tickets',
          numbers: [child.number, blocked.number, epic.number],
        },
      ],
      [{ type: 'cycle', id: cycle.id }],
    ]);
  });

  it('deletes a Ticket in any Status, archived or claimed', () => {
    const { tickets } = ticketsWith(3);
    tickets.updateTicket(1, { status: 'Done' });
    tickets.archiveTicket(2);
    tickets.claimTicket(3, { agentRunId: 'run-1' });

    for (const number of [1, 2, 3]) {
      tickets.deleteTicket(number);
    }

    expect(tickets.listTickets({ includeArchived: true })).toEqual([]);
  });
});
