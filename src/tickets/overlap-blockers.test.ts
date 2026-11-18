import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotAllowedError, ValidationError } from './errors';

/** A Project with an Active Cycle and `count` ready Tickets in it, top of the Board first. */
function setup(count = 3) {
  const tickets = createTestTickets(undefined, 'agent');
  const project = tickets.createProject({ name: 'Website' });
  const cycle = tickets.createCycle({ projectId: project.id, title: 'Ship' });
  const made = Array.from({ length: count }, (_, index) =>
    tickets.createTicket({
      projectId: project.id,
      title: `Ticket ${index + 1}`,
      labels: ['ready-for-agent'],
    }),
  );
  for (const ticket of made) {
    tickets.planTicket({ cycleId: cycle.id, number: ticket.number });
  }
  tickets.startCycle(cycle.id);
  const add = (blocker: number, blocked: number, sharedCode = 'src/board/') =>
    tickets.addOverlapBlocker({
      projectId: project.id,
      cycleId: cycle.id,
      blocker,
      blocked,
      sharedCode,
    });
  return { tickets, project, cycle, made, add };
}

describe('addOverlapBlocker (ADR 0054)', () => {
  it('blocks the lower Ticket on the higher one and comments on it naming the other and the shared code', () => {
    const { tickets, made, add } = setup();
    const [first, second] = made;

    add(first.number, second.number, '`src/board/board.tsx`');

    expect(tickets.getTicket(second.number).blockedBy).toEqual([first.number]);
    const comments = tickets.listComments(second.number);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toMatchObject({ author: 'agent' });
    expect(comments[0].body).toContain(`T${first.number}`);
    expect(comments[0].body).toContain('`src/board/board.tsx`');
    expect(comments[0].body).toContain('Overlap planning');
  });

  it('follows the Board order, not the Ticket numbers', () => {
    const { tickets, made, add } = setup();
    const [first, , third] = made;
    tickets.updateTicket(third.number, { before: first.number });

    add(third.number, first.number);

    expect(tickets.getTicket(first.number).blockedBy).toEqual([third.number]);
    expect(() => add(first.number, third.number)).toThrow(NotAllowedError);
  });

  it('refuses the lower Ticket as the Blocker, so the higher one always goes first', () => {
    const { tickets, made, add } = setup();
    const [first, second] = made;

    const error = errorFrom(() => add(second.number, first.number));

    expect(error).toBeInstanceOf(NotAllowedError);
    expect((error as Error).message).toContain('higher on the Board');
    expect(tickets.getTicket(first.number).blockedBy).toEqual([]);
  });

  it('refuses a Ticket that is claimed, In progress, archived, not ready, an Epic child or outside the Cycle', () => {
    const { tickets, project, made, add } = setup(6);
    const [top, claimed, archived, notReady, child, outside] = made;
    tickets.claimTicket(claimed.number, { agentRunId: 'run-1' });
    tickets.archiveTicket(archived.number);
    tickets.updateTicket(notReady.number, {
      removeLabels: ['ready-for-agent'],
    });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'An Epic',
      type: 'Epic',
    });
    tickets.updateTicket(child.number, { epicNumber: epic.number });
    tickets.updateTicket(outside.number, { cycleId: null });

    for (const ticket of [claimed, archived, notReady, child, outside]) {
      const error = errorFrom(() => add(top.number, ticket.number));
      expect(error, `T${ticket.number}`).toBeInstanceOf(NotAllowedError);
      expect((error as Error).message).toContain(`T${ticket.number}`);
    }
    expect(tickets.listComments(claimed.number)).toEqual([]);
  });

  it('compares an Epic as a whole', () => {
    const { tickets, project, cycle, made, add } = setup(1);
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'An Epic',
      type: 'Epic',
      labels: ['ready-for-agent'],
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Its child',
      epicNumber: epic.number,
    });
    tickets.planTicket({ cycleId: cycle.id, number: epic.number });

    add(made[0].number, epic.number);

    expect(tickets.getTicket(epic.number).blockedBy).toEqual([made[0].number]);
  });

  it('refuses a Cycle that is not the Active one, and a Ticket blocked on itself', () => {
    const { tickets, project, made } = setup();
    const other = tickets.createCycle({ projectId: project.id, title: 'Next' });

    expect(() =>
      tickets.addOverlapBlocker({
        projectId: project.id,
        cycleId: other.id,
        blocker: made[0].number,
        blocked: made[1].number,
        sharedCode: 'src/',
      }),
    ).toThrow(NotAllowedError);
    expect(() =>
      tickets.addOverlapBlocker({
        projectId: project.id,
        cycleId: tickets.activeCycle(project.id)?.id as number,
        blocker: made[0].number,
        blocked: made[0].number,
        sharedCode: 'src/',
      }),
    ).toThrow(NotAllowedError);
  });

  it('asks for the shared code', () => {
    const { add, made } = setup();

    const error = errorFrom(() => add(made[0].number, made[1].number, '  '));

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors).toHaveProperty('sharedCode');
  });

  it('adds nothing twice: a Blocker already there gets no second comment', () => {
    const { tickets, made, add } = setup();

    add(made[0].number, made[1].number);
    add(made[0].number, made[1].number);

    expect(tickets.listComments(made[1].number)).toHaveLength(1);
  });

  it('refuses a Blocker cycle and leaves no comment', () => {
    const { tickets, made, add } = setup();
    const [first, second, third] = made;
    tickets.updateTicket(first.number, { addBlockers: [third.number] });

    expect(() => add(first.number, third.number)).toThrow();
    expect(tickets.listComments(third.number)).toEqual([]);
    void second;
  });
});
