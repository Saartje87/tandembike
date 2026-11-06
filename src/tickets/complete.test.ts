// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotAllowedError } from './errors';

const setup = () => {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const create = (title: string, labels: string[] = [], extra = {}) =>
    tickets.createTicket({ projectId: project.id, title, labels, ...extra });
  return { tickets, project, create };
};

describe('completing a Ticket', () => {
  it('sets Done and removes the triage state label but keeps category labels', () => {
    const { tickets, create } = setup();
    const ticket = create('Fix the header', ['ready-for-agent', 'bug']);

    const done = tickets.completeTicket(ticket.number);

    expect(done.status).toBe('Done');
    expect(done.labels).toEqual(['bug']);
  });

  it('keeps wontfix', () => {
    const { tickets, create } = setup();
    const ticket = create('Old idea', ['wontfix', 'needs-info']);

    expect(tickets.completeTicket(ticket.number).labels).toEqual(['wontfix']);
  });

  it('releases the Claim and records one Activity entry by the actor', () => {
    const { tickets, create } = setup();
    const ticket = create('Fix the header', ['ready-for-agent']);
    tickets.claimTicket(ticket.number, {
      agentRunId: 'run-1',
      agentName: 'Agent',
    });
    const before = tickets.listActivity(ticket.number).length;

    const done = tickets.completeTicket(ticket.number);

    expect(done.claim).toBeNull();
    const added = tickets.listActivity(ticket.number).slice(before);
    expect(added).toHaveLength(1);
    expect(added[0].actor).toBe('user');
    expect(JSON.stringify(added[0].changes)).toContain('claimReleased');
  });

  it('refuses a Ticket in an archived Project', () => {
    const { tickets, project, create } = setup();
    const ticket = create('Fix the header', ['ready-for-agent']);
    tickets.archiveProject(project.id);

    expect(
      errorFrom(() => tickets.completeTicket(ticket.number)),
    ).toBeInstanceOf(NotAllowedError);
  });
});

describe('completing an Epic', () => {
  it('completes unarchived children, leaves archived ones and clears the Epic label', () => {
    const { tickets, create } = setup();
    const epic = create('Login', ['ready-for-agent'], { type: 'Epic' });
    const a = create('A', ['ready-for-agent'], { epicNumber: epic.number });
    const b = create('B', ['wontfix'], { epicNumber: epic.number });
    const c = create('C', ['needs-info'], { epicNumber: epic.number });
    tickets.archiveTicket(c.number);

    const done = tickets.completeTicket(epic.number);

    expect(done.labels).toEqual([]);
    expect(tickets.getTicket(a.number).status).toBe('Done');
    expect(tickets.getTicket(a.number).labels).toEqual([]);
    expect(tickets.getTicket(b.number).labels).toEqual(['wontfix']);
    expect(tickets.getTicket(b.number).status).toBe('Done');
    expect(tickets.getTicket(c.number).status).not.toBe('Done');
    expect(tickets.getTicket(c.number).labels).toEqual(['needs-info']);
  });

  it("releases the Epic's own Claim and records one Activity entry on each Ticket", () => {
    const { tickets, create } = setup();
    const epic = create('Login', ['ready-for-agent'], { type: 'Epic' });
    const a = create('A', ['ready-for-agent'], { epicNumber: epic.number });
    tickets.claimTicket(epic.number, {
      agentRunId: 'run-1',
      agentName: 'Agent',
    });
    const before = [epic, a].map(
      ({ number }) => tickets.listActivity(number).length,
    );

    const done = tickets.completeTicket(epic.number);

    expect(done.claim).toBeNull();
    const epicAdded = tickets.listActivity(epic.number).slice(before[0]);
    expect(epicAdded).toHaveLength(1);
    expect(JSON.stringify(epicAdded[0].changes)).toContain('claimReleased');
    expect(JSON.stringify(epicAdded[0].changes)).toContain('labelRemoved');
    expect(tickets.listActivity(a.number).slice(before[1])).toHaveLength(1);
  });

  it('refuses an Epic in an archived Project', () => {
    const { tickets, project, create } = setup();
    const epic = create('Login', [], { type: 'Epic' });
    const a = create('A', ['ready-for-agent'], { epicNumber: epic.number });
    tickets.archiveProject(project.id);

    expect(errorFrom(() => tickets.completeTicket(epic.number))).toBeInstanceOf(
      NotAllowedError,
    );
    expect(tickets.getTicket(a.number).status).toBe('Todo');
  });
});
