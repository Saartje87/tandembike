// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotFoundError } from './errors';

function ticketsWithOne(actor?: 'user' | 'agent') {
  const tickets = createTestTickets(undefined, actor);
  const project = tickets.createProject({ name: 'Website' });
  const ticket = tickets.createTicket({
    projectId: project.id,
    title: 'Fix the header',
  });
  return { tickets, project, ticket };
}

/** Each entry of Ticket `number`'s Activity as its actor and changes. */
function changesOf(
  tickets: ReturnType<typeof createTestTickets>,
  number: number,
) {
  return tickets.listActivity(number).map(({ actor, changes }) => ({
    actor,
    changes,
  }));
}

describe('Activity', () => {
  it('records who created a Ticket', () => {
    const { tickets, ticket } = ticketsWithOne();
    const agent = ticketsWithOne('agent');

    expect(tickets.listActivity(ticket.number)).toEqual([
      {
        id: expect.any(Number),
        ticketNumber: ticket.number,
        actor: 'user',
        changes: [{ type: 'created' }],
        createdAt: expect.any(Date),
      },
    ]);
    expect(changesOf(agent.tickets, agent.ticket.number)).toEqual([
      { actor: 'agent', changes: [{ type: 'created' }] },
    ]);
  });

  it('refuses an unknown Ticket', () => {
    const tickets = createTestTickets();

    expect(errorFrom(() => tickets.listActivity(99))).toEqual(
      new NotFoundError('There is no Ticket T99.'),
    );
  });

  describe('updating a Ticket', () => {
    it('writes one entry listing every change, old and new', () => {
      const { tickets, project, ticket } = ticketsWithOne();
      const other = tickets.createProject({ name: 'Shop' });
      tickets.addLabels(ticket.number, ['needs-triage']);

      tickets.updateTicket(ticket.number, {
        title: 'Fix the footer',
        description: 'It overlaps.',
        status: 'In progress',
        projectId: other.id,
        addLabels: ['Ready-for-agent'],
        removeLabels: ['needs-triage'],
      });

      expect(changesOf(tickets, ticket.number).at(-1)).toEqual({
        actor: 'user',
        changes: [
          { type: 'status', from: 'Todo', to: 'In progress' },
          {
            type: 'project',
            from: { id: project.id, name: 'Website' },
            to: { id: other.id, name: 'Shop' },
          },
          { type: 'title', from: 'Fix the header', to: 'Fix the footer' },
          { type: 'description' },
          { type: 'labelRemoved', label: 'needs-triage' },
          { type: 'labelAdded', label: 'ready-for-agent' },
        ],
      });
    });

    it('records an Origin and an Epic colour change', () => {
      const { tickets, project, ticket } = ticketsWithOne();
      const spec = tickets.createTicket({
        projectId: project.id,
        title: 'Spec',
      });
      const epic = tickets.createTicket({
        projectId: project.id,
        title: 'Epic',
        type: 'Epic',
        color: 'red',
      });

      tickets.updateTicket(ticket.number, { originNumber: spec.number });
      tickets.updateTicket(ticket.number, { originNumber: null });
      tickets.updateTicket(epic.number, { color: 'blue' });

      expect(
        changesOf(tickets, ticket.number).map(({ changes }) => changes),
      ).toEqual([
        [{ type: 'created' }],
        [{ type: 'origin', from: null, to: spec.number }],
        [{ type: 'origin', from: spec.number, to: null }],
      ]);
      expect(changesOf(tickets, epic.number).at(-1)?.changes).toEqual([
        { type: 'color', from: 'red', to: 'blue' },
      ]);
    });

    it('writes nothing when nothing changes', () => {
      const { tickets, project, ticket } = ticketsWithOne();
      tickets.addLabels(ticket.number, ['bug']);
      const before = tickets.listActivity(ticket.number);

      tickets.updateTicket(ticket.number, {
        title: ' Fix the header ',
        description: '',
        status: 'Todo',
        projectId: project.id,
        addLabels: ['BUG'],
        removeLabels: ['enhancement'],
        acceptanceCriteria: [],
      });
      tickets.updateTicket(ticket.number, {});

      expect(tickets.listActivity(ticket.number)).toEqual(before);
    });

    it('records a replaced criteria list without a diff, only when it changed', () => {
      const { tickets, ticket } = ticketsWithOne();

      const { acceptanceCriteria } = tickets.updateTicket(ticket.number, {
        acceptanceCriteria: [{ text: 'It works' }],
      });
      tickets.updateTicket(ticket.number, {
        acceptanceCriteria: [
          { id: acceptanceCriteria[0].id, text: 'It works' },
        ],
      });

      expect(
        changesOf(tickets, ticket.number).map(({ changes }) => changes),
      ).toEqual([[{ type: 'created' }], [{ type: 'criteriaEdited' }]]);
    });

    it('records the Claim release in the same entry as moving to Done', () => {
      const { tickets, ticket } = ticketsWithOne();
      tickets.claimTicket(ticket.number, {
        agentRunId: 'run-1',
        agentName: 'Claude',
      });

      tickets.updateTicket(ticket.number, { status: 'Done' });

      expect(changesOf(tickets, ticket.number).at(-1)?.changes).toEqual([
        { type: 'status', from: 'Todo', to: 'Done' },
        { type: 'claimReleased', agentRunId: 'run-1', agentName: 'Claude' },
      ]);
    });

    it('writes no entry for a refused change', () => {
      const { tickets, ticket } = ticketsWithOne();

      errorFrom(() =>
        tickets.updateTicket(ticket.number, {
          status: 'Done',
          acceptanceCriteria: [{ id: 999, text: 'Unknown' }],
        }),
      );

      expect(tickets.listActivity(ticket.number)).toHaveLength(1);
      expect(tickets.getTicket(ticket.number).status).toBe('Todo');
    });
  });

  it('records labels added and removed, but not ones already there or absent', () => {
    const { tickets, ticket } = ticketsWithOne();

    tickets.addLabels(ticket.number, ['bug', 'ui']);
    tickets.addLabels(ticket.number, ['BUG']);
    tickets.removeLabels(ticket.number, ['ui', 'enhancement']);
    tickets.removeLabels(ticket.number, ['ui']);

    expect(
      changesOf(tickets, ticket.number).map(({ changes }) => changes),
    ).toEqual([
      [{ type: 'created' }],
      [
        { type: 'labelAdded', label: 'bug' },
        { type: 'labelAdded', label: 'ui' },
      ],
      [{ type: 'labelRemoved', label: 'ui' }],
    ]);
  });

  it('records each criterion checked or unchecked, with its text', () => {
    const { tickets, ticket } = ticketsWithOne();
    const [first, second] = tickets.updateTicket(ticket.number, {
      acceptanceCriteria: [
        { text: 'It works' },
        { text: 'It is tested', checked: true },
      ],
    }).acceptanceCriteria;

    tickets.setAcceptanceCriteriaChecked(ticket.number, [
      { id: first.id, checked: true },
      { id: second.id, checked: false },
    ]);
    tickets.setAcceptanceCriteriaChecked(ticket.number, [
      { id: first.id, checked: true },
    ]);

    expect(changesOf(tickets, ticket.number).slice(2)).toEqual([
      {
        actor: 'user',
        changes: [
          { type: 'criterionChecked', text: 'It works' },
          { type: 'criterionUnchecked', text: 'It is tested' },
        ],
      },
    ]);
  });

  it('records a Blocker added or removed on both Tickets', () => {
    const { tickets, project, ticket } = ticketsWithOne('agent');
    const blocker = tickets.createTicket({
      projectId: project.id,
      title: 'Design',
    });

    tickets.addBlocker({ blocker: blocker.number, blocked: ticket.number });
    tickets.addBlocker({ blocker: blocker.number, blocked: ticket.number });
    tickets.removeBlocker({ blocker: blocker.number, blocked: ticket.number });
    tickets.removeBlocker({ blocker: blocker.number, blocked: ticket.number });

    expect(changesOf(tickets, ticket.number).slice(1)).toEqual([
      {
        actor: 'agent',
        changes: [{ type: 'blockedByAdded', number: blocker.number }],
      },
      {
        actor: 'agent',
        changes: [{ type: 'blockedByRemoved', number: blocker.number }],
      },
    ]);
    expect(changesOf(tickets, blocker.number).slice(1)).toEqual([
      {
        actor: 'agent',
        changes: [{ type: 'blocksAdded', number: ticket.number }],
      },
      {
        actor: 'agent',
        changes: [{ type: 'blocksRemoved', number: ticket.number }],
      },
    ]);
  });

  it('writes nothing on the Tickets a Blocker unblocks by resolving', () => {
    const { tickets, project, ticket } = ticketsWithOne();
    const blocker = tickets.createTicket({
      projectId: project.id,
      title: 'Design',
    });
    tickets.addBlocker({ blocker: blocker.number, blocked: ticket.number });
    const before = tickets.listActivity(ticket.number);

    tickets.updateTicket(blocker.number, { status: 'Done' });
    tickets.archiveTicket(blocker.number);

    expect(tickets.listActivity(ticket.number)).toEqual(before);
  });

  it('records archiving and restoring, and keeps Activity readable while archived', () => {
    const { tickets, project, ticket } = ticketsWithOne();
    const others = ['Logo', 'Footer'].map((title) =>
      tickets.createTicket({ projectId: project.id, title }),
    );

    tickets.archiveTicket(ticket.number);
    tickets.archiveTicket(ticket.number);
    tickets.archiveTickets(others.map((other) => other.number));

    expect(changesOf(tickets, ticket.number).at(-1)?.changes).toEqual([
      { type: 'archived' },
    ]);
    expect(tickets.listActivity(ticket.number)).toHaveLength(2);
    for (const other of others) {
      expect(changesOf(tickets, other.number).at(-1)?.changes).toEqual([
        { type: 'archived' },
      ]);
      expect(tickets.listActivity(other.number)).toHaveLength(2);
    }

    tickets.restoreTicket(ticket.number);

    expect(changesOf(tickets, ticket.number).at(-1)?.changes).toEqual([
      { type: 'restored' },
    ]);
  });

  it('records a Claim taken, released and cleared, with the Agent run', () => {
    const { tickets, ticket } = ticketsWithOne('agent');
    const run = { agentRunId: 'run-1', agentName: 'Claude' };

    tickets.claimTicket(ticket.number, run);
    tickets.claimTicket(ticket.number, run);
    tickets.releaseTicketClaim(ticket.number, run);
    tickets.releaseTicketClaim(ticket.number, run);
    tickets.claimTicket(ticket.number, { agentRunId: 'run-2' });
    tickets.clearTicketClaim(ticket.number);
    tickets.clearTicketClaim(ticket.number);

    expect(
      changesOf(tickets, ticket.number).map(({ changes }) => changes),
    ).toEqual([
      [{ type: 'created' }],
      [{ type: 'claimTaken', ...run }],
      [{ type: 'claimReleased', ...run }],
      [{ type: 'claimTaken', agentRunId: 'run-2', agentName: null }],
      [{ type: 'claimCleared', agentRunId: 'run-2', agentName: null }],
    ]);
  });

  it('records a Board move that changes the Status, but not a reorder', () => {
    const { tickets, project, ticket } = ticketsWithOne();
    const other = tickets.createTicket({
      projectId: project.id,
      title: 'Logo',
    });
    tickets.claimTicket(ticket.number, { agentRunId: 'run-1' });

    tickets.reorderTickets({
      projectId: project.id,
      status: 'Todo',
      ticketNumbers: [other.number, ticket.number],
    });
    tickets.moveTickets({
      projectId: project.id,
      ticketNumbers: [other.number],
      status: 'Todo',
      before: null,
    });
    tickets.moveTickets({
      projectId: project.id,
      ticketNumbers: [ticket.number],
      status: 'Done',
      before: null,
    });

    expect(tickets.listActivity(other.number)).toHaveLength(1);
    expect(changesOf(tickets, ticket.number).at(-1)?.changes).toEqual([
      { type: 'status', from: 'Todo', to: 'Done' },
      { type: 'claimReleased', agentRunId: 'run-1', agentName: null },
    ]);
  });

  it('records a batch update on each Ticket that changed, and none on the rest', () => {
    const { tickets, project, ticket } = ticketsWithOne();
    const done = tickets.createTicket({
      projectId: project.id,
      title: 'Logo',
      status: 'Done',
    });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Epic',
      type: 'Epic',
    });

    const { failed } = tickets.updateTickets({
      ticketNumbers: [ticket.number, done.number, epic.number],
      status: 'Done',
    });

    expect(failed.map(({ number }) => number)).toEqual([epic.number]);
    expect(changesOf(tickets, ticket.number).at(-1)?.changes).toEqual([
      { type: 'status', from: 'Todo', to: 'Done' },
    ]);
    expect(tickets.listActivity(done.number)).toHaveLength(1);
    expect(tickets.listActivity(epic.number)).toHaveLength(1);
  });

  it('records each Ticket of a created batch', () => {
    const tickets = createTestTickets(undefined, 'agent');
    const project = tickets.createProject({ name: 'Website' });

    const created = tickets.createTicketBatch({
      projectId: project.id,
      tickets: [{ title: 'One' }, { title: 'Two', blockedByPositions: [0] }],
    });

    for (const { number } of created) {
      expect(changesOf(tickets, number)).toEqual([
        { actor: 'agent', changes: [{ type: 'created' }] },
      ]);
    }
  });

  it('deletes a Ticket with its Activity', () => {
    const { tickets, ticket } = ticketsWithOne();
    tickets.addLabels(ticket.number, ['bug']);

    tickets.deleteTicket(ticket.number);

    expect(errorFrom(() => tickets.listActivity(ticket.number))).toEqual(
      new NotFoundError(`There is no Ticket T${ticket.number}.`),
    );
  });
});
