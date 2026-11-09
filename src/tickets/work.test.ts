// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotAllowedError, ValidationError } from './errors';

const setup = () => {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const cycle = tickets.createCycle({ projectId: project.id, title: 'Goal' });
  const make = (
    title: string,
    extra: Partial<Parameters<typeof tickets.createTicket>[0]> = {},
  ) => {
    const ticket = tickets.createTicket({
      projectId: project.id,
      title,
      labels: ['ready-for-agent'],
      ...extra,
    });
    tickets.planTicket({ cycleId: cycle.id, number: ticket.number });
    return ticket;
  };
  return { tickets, project, cycle, make };
};

describe('nextWork', () => {
  it('says there is no Active Cycle until one starts', () => {
    const { tickets, project, make } = setup();
    make('A');

    expect(tickets.nextWork({ projectId: project.id })).toEqual({
      ticket: null,
      reason: 'no-active-cycle',
    });
  });

  it('says nothing is ready when no Todo Ticket carries ready-for-agent', () => {
    const { tickets, project, cycle, make } = setup();
    make('A', { labels: ['needs-triage'] });
    make('B', { status: 'In progress' });
    tickets.startCycle(cycle.id);

    expect(tickets.nextWork({ projectId: project.id })).toEqual({
      ticket: null,
      reason: 'nothing-ready',
    });
  });

  it('returns the top ready Ticket in Board order', () => {
    const { tickets, project, cycle, make } = setup();
    const first = make('First');
    const second = make('Second');
    tickets.startCycle(cycle.id);
    tickets.sortLane({
      projectId: project.id,
      status: 'Todo',
      cycleId: cycle.id,
      ticketNumbers: [second.number],
    });

    const next = tickets.nextWork({ projectId: project.id });

    expect(next.ticket?.number).toBe(second.number);
  });

  it('skips blocked, claimed, archived and Epic-child Tickets', () => {
    const { tickets, project, cycle, make } = setup();
    const blocker = tickets.createTicket({
      projectId: project.id,
      title: 'Blocker',
    });
    const blocked = make('Blocked');
    tickets.addBlocker({ blocker: blocker.number, blocked: blocked.number });
    const claimed = make('Claimed');
    tickets.claimTicket(claimed.number, { agentRunId: 'other' });
    const archived = make('Archived');
    tickets.archiveTicket(archived.number);
    const epic = make('Epic', { type: 'Epic' });
    const child = make('Child');
    tickets.attachTicketsToEpic({
      epic: epic.number,
      children: [child.number],
    });
    const open = make('Open');
    tickets.startCycle(cycle.id);

    // The Epic has a child, so it is eligible and sits before Open.
    expect(tickets.nextWork({ projectId: project.id }).ticket?.number).toBe(
      epic.number,
    );
    tickets.claimTicket(epic.number, { agentRunId: 'other' });
    expect(tickets.nextWork({ projectId: project.id }).ticket?.number).toBe(
      open.number,
    );
  });

  it('leaves out an Epic without a child', () => {
    const { tickets, project, cycle, make } = setup();
    make('Epic', { type: 'Epic' });
    tickets.startCycle(cycle.id);

    expect(tickets.nextWork({ projectId: project.id })).toEqual({
      ticket: null,
      reason: 'nothing-ready',
    });
  });

  it('says all are blocked or claimed when ready work is held back', () => {
    const { tickets, project, cycle, make } = setup();
    const only = make('Only');
    tickets.claimTicket(only.number, { agentRunId: 'other' });
    tickets.startCycle(cycle.id);

    expect(tickets.nextWork({ projectId: project.id })).toEqual({
      ticket: null,
      reason: 'all-blocked-or-claimed',
    });
  });
});

describe('startWork', () => {
  it('claims a Todo Ticket, moves it to In progress and returns the bundle', () => {
    const { tickets, project, cycle, make } = setup();
    tickets.setProjectAgentSettings(project.id, { checkCommand: 'npm test' });
    const ticket = make('Build it');
    tickets.addComment(ticket.number, { body: 'Context', author: 'user' });
    tickets.startCycle(cycle.id);

    const bundle = tickets.startWork(ticket.number, 'run-1');

    expect(bundle.ticket).toMatchObject({
      number: ticket.number,
      status: 'In progress',
      claim: { agentRunId: 'run-1' },
    });
    expect(bundle.comments.map(({ body }) => body)).toEqual(['Context']);
    expect(bundle.blockers).toEqual([]);
    expect(bundle.epic).toBeNull();
    expect(bundle.cycle).toMatchObject({ id: cycle.id, state: 'Active' });
    expect(bundle.checkCommand).toBe('npm test');
  });

  it('lists Blockers with their Statuses', () => {
    const { tickets, project, make } = setup();
    const done = tickets.createTicket({
      projectId: project.id,
      title: 'Done one',
      status: 'Done',
    });
    const ticket = make('Build it');
    tickets.addBlocker({ blocker: done.number, blocked: ticket.number });

    const bundle = tickets.startWork(ticket.number, 'run-1');

    expect(bundle.blockers).toEqual([
      expect.objectContaining({ number: done.number, status: 'Done' }),
    ]);
  });

  it('refuses a Ticket another run holds, naming the holder', () => {
    const { tickets, make } = setup();
    const ticket = make('Build it');
    tickets.claimTicket(ticket.number, { agentRunId: 'run-9' });

    expect(errorFrom(() => tickets.startWork(ticket.number, 'run-1'))).toEqual(
      new NotAllowedError(
        `Ticket T${ticket.number} is already claimed by Agent run run-9.`,
      ),
    );
    expect(tickets.getTicket(ticket.number).status).toBe('Todo');
  });

  it('refuses a blocked Ticket, naming its unresolved Blockers', () => {
    const { tickets, project, make } = setup();
    const blocker = tickets.createTicket({
      projectId: project.id,
      title: 'First',
    });
    const ticket = make('Build it');
    tickets.addBlocker({ blocker: blocker.number, blocked: ticket.number });

    const error = errorFrom(() => tickets.startWork(ticket.number, 'run-1'));

    expect(error).toBeInstanceOf(NotAllowedError);
    expect((error as Error).message).toContain(`T${blocker.number}`);
    expect(tickets.getTicket(ticket.number).claim).toBeNull();
  });

  it('names the Claim holder before the Blockers when both apply', () => {
    const { tickets, project, make } = setup();
    const blocker = tickets.createTicket({
      projectId: project.id,
      title: 'First',
    });
    const ticket = make('Build it');
    tickets.addBlocker({ blocker: blocker.number, blocked: ticket.number });
    tickets.claimTicket(ticket.number, { agentRunId: 'run-9' });

    expect(errorFrom(() => tickets.startWork(ticket.number, 'run-1'))).toEqual(
      new NotAllowedError(
        `Ticket T${ticket.number} is already claimed by Agent run run-9.`,
      ),
    );
  });

  it('only claims an In progress Ticket', () => {
    const { tickets, make } = setup();
    const ticket = make('Review me', { status: 'In progress' });

    const bundle = tickets.startWork(ticket.number, 'run-2');

    expect(bundle.ticket).toMatchObject({
      status: 'In progress',
      claim: { agentRunId: 'run-2' },
    });
  });

  it('claims an Epic without changing its Status and names the next child', () => {
    const { tickets, project, make } = setup();
    const epic = make('Epic', { type: 'Epic' });
    const first = make('First');
    const second = make('Second');
    tickets.attachTicketsToEpic({
      epic: epic.number,
      children: [first.number, second.number],
    });
    tickets.addBlocker({ blocker: first.number, blocked: second.number });

    const bundle = tickets.startWork(epic.number, 'run-1');

    expect(bundle.ticket.claim?.agentRunId).toBe('run-1');
    expect(bundle.ticket.status).toBe('Todo');
    expect(bundle.epic).toMatchObject({
      number: epic.number,
      nextChild: first.number,
    });
    expect(bundle.epic?.children.map(({ number }) => number)).toEqual([
      first.number,
      second.number,
    ]);
    expect(bundle.epic?.children[1].blockedBy).toEqual([first.number]);
    expect(project.id).toBeDefined();
  });

  it("moves a child under its own run's Epic Claim to In progress", () => {
    const { tickets, make } = setup();
    const epic = make('Epic', { type: 'Epic' });
    const child = make('Child');
    tickets.attachTicketsToEpic({
      epic: epic.number,
      children: [child.number],
    });
    tickets.startWork(epic.number, 'run-1');

    const bundle = tickets.startWork(child.number, 'run-1');

    expect(bundle.ticket.status).toBe('In progress');
    expect(bundle.epic).toMatchObject({ number: epic.number });
    expect(errorFrom(() => tickets.startWork(child.number, 'run-2'))).toEqual(
      new NotAllowedError(
        `Ticket T${child.number} is in Epic T${epic.number}, which is claimed by Agent run run-1. Claiming an Epic covers its children.`,
      ),
    );
  });
});

describe("startWork's merge mode", () => {
  it('is approve while Auto-merge is off and auto once it is on', () => {
    const { tickets, project, make } = setup();
    const off = make('Off');
    const on = make('On');

    expect(tickets.startWork(off.number, 'run-1').merge).toBe('approve');
    tickets.setProjectAgentSettings(project.id, { autoMerge: true });
    expect(tickets.startWork(on.number, 'run-2').merge).toBe('auto');
  });

  it('keeps the mode the Claim was taken with, so a later switch changes only later runs', () => {
    const { tickets, project, make } = setup();
    const ticket = make('A');
    tickets.startWork(ticket.number, 'run-1');

    tickets.setProjectAgentSettings(project.id, { autoMerge: true });

    expect(tickets.startWork(ticket.number, 'run-1').merge).toBe('approve');
    expect(tickets.claimMergeMode(ticket.number)).toBe('approve');
  });

  it("gives an Epic's children the mode of the Epic's Claim", () => {
    const { tickets, project, make } = setup();
    const epic = make('Login', { type: 'Epic' });
    const child = make('Form', { epicNumber: epic.number });
    tickets.setProjectAgentSettings(project.id, { autoMerge: true });

    expect(tickets.startWork(epic.number, 'run-1').merge).toBe('auto');
    tickets.setProjectAgentSettings(project.id, { autoMerge: false });
    expect(tickets.startWork(child.number, 'run-1').merge).toBe('auto');
  });

  it('has no mode without a Claim', () => {
    const { tickets, make } = setup();
    const ticket = make('A');

    expect(tickets.claimMergeMode(ticket.number)).toBeNull();
  });
});

describe('startWork on an Epic child blocked by a sibling', () => {
  const epicSetup = () => {
    const { tickets, project, make } = setup();
    const epic = make('Epic', { type: 'Epic' });
    const first = make('First');
    const second = make('Second');
    tickets.attachTicketsToEpic({
      epic: epic.number,
      children: [first.number, second.number],
    });
    tickets.addBlocker({ blocker: first.number, blocked: second.number });
    return { tickets, project, epic, first, second };
  };

  it("starts it under the run's Epic Claim once the sibling is In progress", () => {
    const { tickets, epic, first, second } = epicSetup();
    tickets.startWork(epic.number, 'run-1');
    tickets.startWork(first.number, 'run-1');

    const bundle = tickets.startWork(second.number, 'run-1');

    expect(bundle.ticket.status).toBe('In progress');
    expect(bundle.epic?.nextChild).toBeNull();
  });

  it('still refuses it while the sibling is Todo, naming the sibling', () => {
    const { tickets, epic, first, second } = epicSetup();
    tickets.startWork(epic.number, 'run-1');

    expect(errorFrom(() => tickets.startWork(second.number, 'run-1'))).toEqual(
      new NotAllowedError(
        `Ticket T${second.number} is blocked by T${first.number} (Todo). Finish it first.`,
      ),
    );
    expect(tickets.getTicket(second.number).status).toBe('Todo');
  });

  it('still refuses it for a Blocker outside the Epic that is not Done', () => {
    const { tickets, project, epic, first, second } = epicSetup();
    const outside = tickets.createTicket({
      projectId: project.id,
      title: 'Outside',
      status: 'In progress',
    });
    tickets.addBlocker({ blocker: outside.number, blocked: second.number });
    tickets.startWork(epic.number, 'run-1');
    tickets.startWork(first.number, 'run-1');

    expect(errorFrom(() => tickets.startWork(second.number, 'run-1'))).toEqual(
      new NotAllowedError(
        `Ticket T${second.number} is blocked by T${outside.number} (In progress). Finish it first.`,
      ),
    );
  });

  it('still refuses it without the Epic Claim', () => {
    const { tickets, first, second } = epicSetup();
    tickets.updateTicket(first.number, { status: 'In progress' });

    expect(errorFrom(() => tickets.startWork(second.number, 'run-1'))).toEqual(
      new NotAllowedError(
        `Ticket T${second.number} is blocked by T${first.number} (In progress). Finish it first.`,
      ),
    );
  });

  it('moves nextChild past a started child to the one it unblocks', () => {
    const { tickets, epic, first, second } = epicSetup();
    tickets.startWork(epic.number, 'run-1');

    const bundle = tickets.startWork(first.number, 'run-1');

    expect(bundle.epic?.nextChild).toBe(second.number);
  });
});

describe('abandonWork', () => {
  it('comments, releases the Claim and moves the Ticket back to Todo', () => {
    const { tickets, make } = setup();
    const ticket = make('Build it');
    tickets.startWork(ticket.number, 'run-1');

    const result = tickets.abandonWork(ticket.number, 'run-1', 'Too big');

    expect(result).toMatchObject({ status: 'Todo', claim: null });
    expect(tickets.listComments(ticket.number).map(({ body }) => body)).toEqual(
      ['Too big'],
    );
  });

  it('stays In progress when the Ticket has a PR reference', () => {
    const { tickets, make } = setup();
    const ticket = make('Build it');
    tickets.startWork(ticket.number, 'run-1');
    tickets.addExternalReferences(ticket.number, [
      'https://github.com/o/r/pull/3',
    ]);

    const result = tickets.abandonWork(ticket.number, 'run-1', 'Waiting');

    expect(result).toMatchObject({ status: 'In progress', claim: null });
  });

  it('refuses another run and writes no comment; needs a reason', () => {
    const { tickets, make } = setup();
    const ticket = make('Build it');
    tickets.startWork(ticket.number, 'run-1');

    expect(
      errorFrom(() => tickets.abandonWork(ticket.number, 'run-2', 'Mine')),
    ).toBeInstanceOf(NotAllowedError);
    expect(tickets.listComments(ticket.number)).toEqual([]);
    expect(
      errorFrom(() => tickets.abandonWork(ticket.number, 'run-1', '  ')),
    ).toBeInstanceOf(ValidationError);
    expect(tickets.getTicket(ticket.number).claim).not.toBeNull();
  });
});

describe('abandonWork without a Claim of the run', () => {
  it('refuses an unclaimed Ticket and writes no comment', () => {
    const { tickets, make } = setup();
    const ticket = make('Build it', { status: 'In progress' });

    expect(
      errorFrom(() => tickets.abandonWork(ticket.number, 'run-1', 'Nope')),
    ).toBeInstanceOf(NotAllowedError);
    expect(tickets.listComments(ticket.number)).toEqual([]);
    expect(tickets.getTicket(ticket.number).status).toBe('In progress');
  });

  it("points a child under the run's Epic Claim to its Epic", () => {
    const { tickets, make } = setup();
    const epic = make('Epic', { type: 'Epic' });
    const child = make('Child');
    tickets.attachTicketsToEpic({
      epic: epic.number,
      children: [child.number],
    });
    tickets.startWork(epic.number, 'run-1');
    tickets.startWork(child.number, 'run-1');

    expect(
      errorFrom(() => tickets.abandonWork(child.number, 'run-1', 'Stuck')),
    ).toEqual(
      new NotAllowedError(
        `Ticket T${child.number} is covered by your Claim on Epic T${epic.number}: abandon the Epic instead.`,
      ),
    );
    expect(tickets.listComments(child.number)).toEqual([]);
  });
});

describe('linkPullRequest', () => {
  it('adds the reference and releases the run Claim together', () => {
    const { tickets, make } = setup();
    const ticket = make('Build it');
    tickets.startWork(ticket.number, 'run-1');

    const result = tickets.linkPullRequest(
      ticket.number,
      'https://github.com/o/r/pull/3',
      'run-1',
    );

    expect(result.claim).toBeNull();
    expect(result.externalReferences).toHaveLength(1);
  });

  it('adds no reference when another run holds the Claim', () => {
    const { tickets, make } = setup();
    const ticket = make('Build it');
    tickets.startWork(ticket.number, 'run-1');

    expect(
      errorFrom(() =>
        tickets.linkPullRequest(
          ticket.number,
          'https://github.com/o/r/pull/3',
          'run-2',
        ),
      ),
    ).toBeInstanceOf(NotAllowedError);
    expect(tickets.getTicket(ticket.number).externalReferences).toEqual([]);
  });
});

describe('nextWork for an Epic planned elsewhere', () => {
  it('returns the Epic whose child is planned in the Active Cycle', () => {
    const { tickets, project, cycle, make } = setup();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Epic',
      type: 'Epic',
      labels: ['ready-for-agent'],
    });
    const child = make('Child');
    tickets.attachTicketsToEpic({
      epic: epic.number,
      children: [child.number],
    });
    tickets.startCycle(cycle.id);

    expect(tickets.nextWork({ projectId: project.id }).ticket?.number).toBe(
      epic.number,
    );
  });
});
