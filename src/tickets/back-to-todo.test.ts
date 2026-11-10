// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotAllowedError } from './errors';

const setup = () => {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const create = (title: string, labels: string[] = []) =>
    tickets.createTicket({ projectId: project.id, title, labels });
  return { tickets, project, create };
};

describe('sending a Ticket Back to Todo', () => {
  it('sets Todo at the end of the Todo order and keeps the labels', () => {
    const { tickets, create } = setup();
    const parked = create('Parked', ['ready-for-agent', 'bug']);
    tickets.updateTicket(parked.number, { status: 'In progress' });
    const queued = create('Queued', ['ready-for-agent']);

    const back = tickets.backToTodo(parked.number);

    expect(back.status).toBe('Todo');
    expect(back.labels.sort()).toEqual(['bug', 'ready-for-agent']);
    expect(back.position).toBeGreaterThan(
      tickets.getTicket(queued.number).position,
    );
  });

  it('releases any Claim and records one Activity entry by the User', () => {
    const { tickets, create } = setup();
    const ticket = create('Running', ['ready-for-agent']);
    tickets.updateTicket(ticket.number, { status: 'In progress' });
    tickets.claimTicket(ticket.number, {
      agentRunId: 'run-1',
      agentName: 'Agent',
    });
    const before = tickets.listActivity(ticket.number).length;

    const back = tickets.backToTodo(ticket.number);

    expect(back.claim).toBeNull();
    const added = tickets.listActivity(ticket.number).slice(before);
    expect(added).toHaveLength(1);
    expect(added[0].actor).toBe('user');
    expect(JSON.stringify(added[0].changes)).toContain('claimReleased');
    expect(JSON.stringify(added[0].changes)).toContain('Todo');
  });

  it('refuses a Ticket in an archived Project, changing nothing', () => {
    const { tickets, project, create } = setup();
    const ticket = create('Parked');
    tickets.updateTicket(ticket.number, { status: 'In progress' });
    tickets.archiveProject(project.id);

    expect(errorFrom(() => tickets.backToTodo(ticket.number))).toBeInstanceOf(
      NotAllowedError,
    );
    expect(tickets.getTicket(ticket.number).status).toBe('In progress');
  });

  it('refuses an archived Ticket, changing nothing', () => {
    const { tickets, create } = setup();
    const ticket = create('Parked');
    tickets.updateTicket(ticket.number, { status: 'In progress' });
    tickets.archiveTicket(ticket.number);

    expect(errorFrom(() => tickets.backToTodo(ticket.number))).toEqual(
      new NotAllowedError(
        `Ticket T${ticket.number} is archived. Restore it before changing it.`,
      ),
    );
    expect(tickets.getTicket(ticket.number).status).toBe('In progress');
  });
});

describe('sending an Epic Back to Todo', () => {
  const setupEpic = () => {
    const { tickets, project, create } = setup();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Login',
      type: 'Epic',
      labels: ['ready-for-agent'],
    });
    const child = (title: string) =>
      tickets.createTicket({
        projectId: project.id,
        title,
        labels: ['ready-for-agent'],
        epicNumber: epic.number,
      });
    return { tickets, project, create, epic, child };
  };

  it("releases the Epic's Claim and sets In progress children to Todo, leaving Done and archived ones", () => {
    const { tickets, create, epic, child } = setupEpic();
    const running = child('Running');
    const review = child('Review');
    const done = child('Done');
    const todo = child('Todo');
    const archived = child('Archived');
    for (const c of [running, review, done, archived]) {
      tickets.updateTicket(c.number, { status: 'In progress' });
    }
    tickets.updateTicket(done.number, { status: 'Done' });
    tickets.archiveTicket(archived.number);
    tickets.claimTicket(epic.number, { agentRunId: 'run-1', agentName: 'A' });
    const queued = create('Queued');

    const back = tickets.backToTodo(epic.number);

    expect(back.claim).toBeNull();
    expect(tickets.getTicket(running.number).status).toBe('Todo');
    expect(tickets.getTicket(review.number).status).toBe('Todo');
    expect(tickets.getTicket(todo.number).status).toBe('Todo');
    expect(tickets.getTicket(done.number).status).toBe('Done');
    expect(tickets.getTicket(archived.number).status).toBe('In progress');
    expect(tickets.getTicket(running.number).labels).toEqual([
      'ready-for-agent',
    ]);
    expect(tickets.getTicket(running.number).position).toBeGreaterThan(
      tickets.getTicket(queued.number).position,
    );
  });

  it("makes the Epic's derived Status follow its children", () => {
    const { tickets, epic, child } = setupEpic();
    const running = child('Running');
    tickets.updateTicket(running.number, { status: 'In progress' });
    expect(tickets.getTicket(epic.number).status).toBe('In progress');

    expect(tickets.backToTodo(epic.number).status).toBe('Todo');
  });

  it('records the Claim release on the Epic and one Activity entry on a changed child', () => {
    const { tickets, epic, child } = setupEpic();
    const running = child('Running');
    tickets.updateTicket(running.number, { status: 'In progress' });
    tickets.claimTicket(epic.number, { agentRunId: 'run-1', agentName: 'A' });
    const epicBefore = tickets.listActivity(epic.number).length;
    const childBefore = tickets.listActivity(running.number).length;

    tickets.backToTodo(epic.number);

    const onEpic = tickets.listActivity(epic.number).slice(epicBefore);
    expect(JSON.stringify(onEpic.map((a) => a.changes))).toContain(
      'claimReleased',
    );
    const onChild = tickets.listActivity(running.number).slice(childBefore);
    expect(onChild).toHaveLength(1);
    expect(onChild[0].actor).toBe('user');
  });

  it('refuses an Epic in an archived Project, changing no child', () => {
    const { tickets, project, epic, child } = setupEpic();
    const running = child('Running');
    tickets.updateTicket(running.number, { status: 'In progress' });
    tickets.archiveProject(project.id);

    expect(errorFrom(() => tickets.backToTodo(epic.number))).toBeInstanceOf(
      NotAllowedError,
    );
    expect(tickets.getTicket(running.number).status).toBe('In progress');
  });
});
