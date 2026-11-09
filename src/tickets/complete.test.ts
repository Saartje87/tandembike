// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import {
  NotAllowedError,
  UncheckedCriteriaError,
  ValidationError,
} from './errors';

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

  it('completes a Todo child too, since the one PR covers the whole Epic', () => {
    const { tickets, create } = setup();
    const epic = create('Login', [], { type: 'Epic' });
    const todo = create('Todo child', ['ready-for-agent'], {
      epicNumber: epic.number,
    });
    expect(tickets.getTicket(todo.number).status).toBe('Todo');

    tickets.completeTicket(epic.number);

    expect(tickets.getTicket(todo.number).status).toBe('Done');
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

describe('the completion rule and acceptance criteria', () => {
  const criteria = (...texts: [string, boolean][]) => ({
    acceptanceCriteria: texts.map(([text, checked]) => ({ text, checked })),
  });

  it('refuses a Ticket with an unchecked criterion, naming it and the Ticket', () => {
    const { tickets, create } = setup();
    const ticket = create(
      'Fix the header',
      ['ready-for-agent'],
      criteria(['Logo shows', true], ['Menu opens', false]),
    );

    const error = errorFrom(() =>
      tickets.completeTicket(ticket.number),
    ) as UncheckedCriteriaError;

    expect(error).toBeInstanceOf(UncheckedCriteriaError);
    expect(error.message).toContain(`T${ticket.number}`);
    expect(error.message).toContain('Menu opens');
    expect(error.message).not.toContain('Logo shows');
    expect(tickets.getTicket(ticket.number).status).toBe('Todo');
  });

  it('completes a Ticket whose criteria are all checked, or which has none', () => {
    const { tickets, create } = setup();
    const checked = create('A', [], criteria(['Logo shows', true]));
    const none = create('B');

    expect(tickets.completeTicket(checked.number).status).toBe('Done');
    expect(tickets.completeTicket(none.number).status).toBe('Done');
  });

  it("refuses an Epic while its own or an unarchived child's criterion is unchecked, naming each", () => {
    const { tickets, create } = setup();
    const epic = create('Login', [], {
      type: 'Epic',
      ...criteria(['Docs updated', false]),
    });
    const a = create('A', [], {
      epicNumber: epic.number,
      ...criteria(['Form validates', false], ['Done already', true]),
    });
    const archived = create('C', [], {
      epicNumber: epic.number,
      ...criteria(['Never mind', false]),
    });
    tickets.archiveTicket(archived.number);

    const error = errorFrom(() =>
      tickets.completeTicket(epic.number),
    ) as UncheckedCriteriaError;

    expect(error).toBeInstanceOf(UncheckedCriteriaError);
    expect(error.unchecked).toEqual([
      { number: epic.number, text: 'Docs updated' },
      { number: a.number, text: 'Form validates' },
    ]);
    expect(error.message).toContain(`T${epic.number}: Docs updated`);
    expect(error.message).toContain(`T${a.number}: Form validates`);
    expect(tickets.getTicket(a.number).status).toBe('Todo');
  });

  it('lists the unchecked criteria without completing', () => {
    const { tickets, create } = setup();
    const ticket = create('A', [], criteria(['Menu opens', false]));

    expect(tickets.uncheckedCriteria(ticket.number)).toEqual([
      { number: ticket.number, text: 'Menu opens' },
    ]);
    expect(tickets.getTicket(ticket.number).status).toBe('Todo');
  });

  it('completes with an override and posts the reason as a comment by the actor, naming the criteria', () => {
    const tickets = createTestTickets(undefined, 'agent');
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'A',
      labels: ['ready-for-agent'],
      ...criteria(['Menu opens', false]),
    });

    const done = tickets.completeTicket(ticket.number, {
      override: 'Menu moved to T99.',
    });

    expect(done.status).toBe('Done');
    expect(done.labels).toEqual([]);
    const [comment] = tickets.listComments(ticket.number);
    expect(comment.author).toBe('agent');
    expect(comment.body).toContain('Menu moved to T99.');
    expect(comment.body).toContain(`T${ticket.number}: Menu opens`);
  });

  it('completes an Epic with an override, posting the comment on the Epic', () => {
    const { tickets, create } = setup();
    const epic = create('Login', [], { type: 'Epic' });
    const a = create('A', [], {
      epicNumber: epic.number,
      ...criteria(['Form validates', false]),
    });

    tickets.completeTicket(epic.number, { override: 'Confirmed by hand.' });

    expect(tickets.getTicket(a.number).status).toBe('Done');
    const [comment] = tickets.listComments(epic.number);
    expect(comment.author).toBe('user');
    expect(comment.body).toContain(`T${a.number}: Form validates`);
    expect(tickets.listComments(a.number)).toEqual([]);
  });

  it('posts no comment for an override when nothing is unchecked', () => {
    const { tickets, create } = setup();
    const ticket = create('A');

    tickets.completeTicket(ticket.number, { override: 'Just in case.' });

    expect(tickets.listComments(ticket.number)).toEqual([]);
  });

  it('refuses a blank override', () => {
    const { tickets, create } = setup();
    const ticket = create('A', [], criteria(['Menu opens', false]));

    expect(
      errorFrom(() => tickets.completeTicket(ticket.number, { override: ' ' })),
    ).toBeInstanceOf(ValidationError);
  });
});
