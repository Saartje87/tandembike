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

    expect(errorFrom(() => tickets.backToTodo(ticket.number))).toBeInstanceOf(
      NotAllowedError,
    );
    expect(tickets.getTicket(ticket.number).status).toBe('In progress');
  });

  it('refuses an Epic until it is covered', () => {
    const { tickets, project } = setup();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Login',
      type: 'Epic',
    });

    expect(errorFrom(() => tickets.backToTodo(epic.number))).toBeDefined();
  });
});
