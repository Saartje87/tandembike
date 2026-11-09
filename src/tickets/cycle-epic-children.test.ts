// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import type { Change } from './changes';
import { NotAllowedError } from './errors';

function setup() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
  const gamma = tickets.createCycle({ projectId: project.id, title: 'Gamma' });
  const epic = tickets.createTicket({
    projectId: project.id,
    title: 'Checkout',
    type: 'Epic',
  });
  const child = (status: 'Todo' | 'Done' = 'Todo', cycleId?: number) =>
    tickets.createTicket({
      projectId: project.id,
      title: 'Child',
      epicNumber: epic.number,
      status,
      cycleId,
    });
  return { tickets, project, beta, gamma, epic, child };
}

describe('Planning an Epic with its children', () => {
  it('plans the Epic and every Backlog child, Done ones included', () => {
    const { tickets, beta, epic, child } = setup();
    const a = child();
    const b = child('Done');

    tickets.planTicket({
      cycleId: beta.id,
      number: epic.number,
      withChildren: true,
    });

    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([
      epic.number,
      a.number,
      b.number,
    ]);
  });

  it('moves a child out of another open Cycle', () => {
    const { tickets, beta, gamma, epic, child } = setup();
    const a = child('Todo', gamma.id);

    tickets.planTicket({
      cycleId: beta.id,
      number: epic.number,
      withChildren: true,
    });

    expect(tickets.getCycle(gamma.id).ticketNumbers).toEqual([]);
    expect(tickets.getCycle(beta.id).ticketNumbers).toContain(a.number);
  });

  it('leaves a child already in the target where it is', () => {
    const { tickets, beta, epic, child } = setup();
    const a = child('Todo', beta.id);
    const b = child();

    tickets.planTicket({
      cycleId: beta.id,
      number: epic.number,
      withChildren: true,
    });

    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([
      epic.number,
      a.number,
      b.number,
    ]);
  });

  it('never touches an archived child', () => {
    const { tickets, beta, epic, child } = setup();
    const archived = child();
    const live = child();
    tickets.archiveTicket(archived.number);

    tickets.planTicket({
      cycleId: beta.id,
      number: epic.number,
      withChildren: true,
    });

    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([
      epic.number,
      live.number,
    ]);
  });

  it('changes nothing when the Epic cannot be planned', () => {
    const { tickets, beta, gamma, epic, child } = setup();
    const a = child();
    const b = child('Todo', gamma.id);
    tickets.planTicket({ cycleId: gamma.id, number: epic.number });

    const error = errorFrom(() =>
      tickets.planTicket({
        cycleId: beta.id,
        number: epic.number,
        withChildren: true,
      }),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([]);
    expect(tickets.getCycle(gamma.id).ticketNumbers).toEqual([
      epic.number,
      b.number,
    ]);
    expect(tickets.getTicket(a.number).cycle).toBeNull();
  });

  it('refuses an Archived Cycle', () => {
    const { tickets, beta, epic, child } = setup();
    const a = child();
    tickets.startCycle(beta.id);
    tickets.archiveCycle(beta.id);

    const error = errorFrom(() =>
      tickets.planTicket({
        cycleId: beta.id,
        number: epic.number,
        withChildren: true,
      }),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
    expect(tickets.getTicket(a.number).cycle).toBeNull();
  });

  it('refuses withChildren on a Ticket that is not an Epic', () => {
    const { tickets, project, beta } = setup();
    const plain = tickets.createTicket({
      projectId: project.id,
      title: 'Plain',
    });

    const error = errorFrom(() =>
      tickets.planTicket({
        cycleId: beta.id,
        number: plain.number,
        withChildren: true,
      }),
    );

    expect(error).toEqual(
      new NotAllowedError(
        `Ticket T${plain.number} is not an Epic. Only an Epic has children to take along.`,
      ),
    );
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([]);
  });

  it('plans only the Epic without the option', () => {
    const { tickets, beta, epic, child } = setup();
    const a = child();

    tickets.planTicket({ cycleId: beta.id, number: epic.number });

    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([epic.number]);
    expect(tickets.getTicket(a.number).cycle).toBeNull();
  });

  it('announces each touched Cycle once, not each child', () => {
    const { tickets, beta, gamma, epic, child } = setup();
    child('Todo', gamma.id);
    child('Todo', gamma.id);
    child();
    const changes: Change[] = [];
    tickets.subscribe((change) => changes.push(change));

    tickets.planTicket({
      cycleId: beta.id,
      number: epic.number,
      withChildren: true,
    });

    expect(changes).toHaveLength(2);
    expect(changes).toContainEqual({ type: 'cycle', id: beta.id });
    expect(changes).toContainEqual({ type: 'cycle', id: gamma.id });
  });
});

describe('Removing an Epic from a Cycle with its children', () => {
  const planned = () => {
    const s = setup();
    s.tickets.planTicket({ cycleId: s.beta.id, number: s.epic.number });
    return s;
  };

  it('unplans the Epic and every live child in the Cycle, Done ones included', () => {
    const { tickets, beta, epic, child } = planned();
    const a = child('Todo', beta.id);
    const b = child('Done', beta.id);

    tickets.unplanTicket({
      cycleId: beta.id,
      number: epic.number,
      withChildren: true,
    });

    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([]);
    expect(tickets.getTicket(a.number).cycle).toBeNull();
    expect(tickets.getTicket(b.number).cycle).toBeNull();
  });

  it('leaves an archived child in the Cycle and a child elsewhere alone', () => {
    const { tickets, beta, gamma, epic, child } = planned();
    const archived = child('Todo', beta.id);
    const live = child('Todo', beta.id);
    const elsewhere = child('Todo', gamma.id);
    tickets.archiveTicket(archived.number);

    tickets.unplanTicket({
      cycleId: beta.id,
      number: epic.number,
      withChildren: true,
    });

    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([archived.number]);
    expect(tickets.getTicket(live.number).cycle).toBeNull();
    expect(tickets.getCycle(gamma.id).ticketNumbers).toEqual([
      elsewhere.number,
    ]);
  });

  it('announces the Cycle once, not each child', () => {
    const { tickets, beta, epic, child } = planned();
    child('Todo', beta.id);
    child('Todo', beta.id);
    const changes: Change[] = [];
    tickets.subscribe((change) => changes.push(change));

    tickets.unplanTicket({
      cycleId: beta.id,
      number: epic.number,
      withChildren: true,
    });

    expect(changes).toEqual([{ type: 'cycle', id: beta.id }]);
  });

  it('changes nothing when the Epic cannot be unplanned', () => {
    const { tickets, beta, epic, child } = setup();
    const a = child('Todo', beta.id);

    const error = errorFrom(() =>
      tickets.unplanTicket({
        cycleId: beta.id,
        number: epic.number,
        withChildren: true,
      }),
    );

    expect(error).toBeInstanceOf(NotAllowedError);
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([a.number]);
  });

  it('refuses withChildren on a Ticket that is not an Epic', () => {
    const { tickets, project, beta } = setup();
    const plain = tickets.createTicket({
      projectId: project.id,
      title: 'Plain',
      cycleId: beta.id,
    });

    const error = errorFrom(() =>
      tickets.unplanTicket({
        cycleId: beta.id,
        number: plain.number,
        withChildren: true,
      }),
    );

    expect(error).toEqual(
      new NotAllowedError(
        `Ticket T${plain.number} is not an Epic. Only an Epic has children to take along.`,
      ),
    );
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([plain.number]);
  });

  it('unplans only the Epic without the option', () => {
    const { tickets, beta, epic, child } = planned();
    const a = child('Todo', beta.id);

    tickets.unplanTicket({ cycleId: beta.id, number: epic.number });

    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([a.number]);
  });

  it('announces the Cycle once', () => {
    const { tickets, beta, epic, child } = planned();
    child('Todo', beta.id);
    child('Todo', beta.id);
    const changes: Change[] = [];
    tickets.subscribe((change) => changes.push(change));

    tickets.unplanTicket({
      cycleId: beta.id,
      number: epic.number,
      withChildren: true,
    });

    expect(changes).toEqual([{ type: 'cycle', id: beta.id }]);
  });
});

describe('Planning Epics with their children in a batch', () => {
  it('plans each Epic with its live children and names the children', () => {
    const { tickets, beta, gamma, epic, child } = setup();
    const a = child();
    const b = child('Done', gamma.id);
    const archived = child();
    tickets.archiveTicket(archived.number);

    const result = tickets.planTickets({
      cycleId: beta.id,
      ticketNumbers: [epic.number],
      withChildren: true,
    });

    expect(result).toMatchObject({
      updated: [epic.number],
      failed: [],
      children: [a.number, b.number],
    });
    expect(result.cycle.ticketNumbers).toEqual([
      epic.number,
      a.number,
      b.number,
    ]);
    expect(tickets.getCycle(gamma.id).ticketNumbers).toEqual([]);
  });

  it('names no child already in the Cycle', () => {
    const { tickets, beta, epic, child } = setup();
    child('Todo', beta.id);
    const b = child();

    const result = tickets.planTickets({
      cycleId: beta.id,
      ticketNumbers: [epic.number],
      withChildren: true,
    });

    expect(result.children).toEqual([b.number]);
  });

  it('fails a Ticket that is not an Epic, and still plans the others', () => {
    const { tickets, project, beta, epic, child } = setup();
    const a = child();
    const plain = tickets.createTicket({
      projectId: project.id,
      title: 'Plain',
    });

    const result = tickets.planTickets({
      cycleId: beta.id,
      ticketNumbers: [plain.number, epic.number],
      withChildren: true,
    });

    expect(result).toMatchObject({
      updated: [epic.number],
      failed: [
        {
          number: plain.number,
          error: `Ticket T${plain.number} is not an Epic. Only an Epic has children to take along.`,
        },
      ],
      children: [a.number],
    });
  });

  it('plans only the named Tickets without the option, and names no children', () => {
    const { tickets, beta, epic, child } = setup();
    child();

    const result = tickets.planTickets({
      cycleId: beta.id,
      ticketNumbers: [epic.number],
    });

    expect(result.cycle.ticketNumbers).toEqual([epic.number]);
    expect(result).not.toHaveProperty('children');
  });
});

describe('Moving an Epic with its children', () => {
  it('moves the Epic and its live children into the Cycle, out of any other open Cycle', () => {
    const { tickets, beta, gamma, epic, child } = setup();
    tickets.planTicket({ cycleId: gamma.id, number: epic.number });
    const a = child('Todo', gamma.id);
    const b = child('Done');
    const archived = child('Todo', gamma.id);
    tickets.archiveTicket(archived.number);

    const result = tickets.moveTicketsToCycle({
      cycleId: beta.id,
      ticketNumbers: [epic.number],
      withChildren: true,
    });

    expect(result).toMatchObject({
      updated: [epic.number],
      failed: [],
      children: [a.number, b.number],
    });
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([
      epic.number,
      a.number,
      b.number,
    ]);
    expect(tickets.getCycle(gamma.id).ticketNumbers).toEqual([archived.number]);
  });

  it('returns the Epic and its live children in its Cycle to the Backlog', () => {
    const { tickets, beta, gamma, epic, child } = setup();
    tickets.planTicket({ cycleId: beta.id, number: epic.number });
    const a = child('Done', beta.id);
    const elsewhere = child('Todo', gamma.id);
    const archived = child('Todo', beta.id);
    tickets.archiveTicket(archived.number);

    const result = tickets.moveTicketsToCycle({
      cycleId: null,
      ticketNumbers: [epic.number],
      withChildren: true,
    });

    expect(result).toMatchObject({
      updated: [epic.number],
      failed: [],
      children: [a.number],
      cycle: null,
    });
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([archived.number]);
    expect(tickets.getCycle(gamma.id).ticketNumbers).toEqual([
      elsewhere.number,
    ]);
  });

  it('fails a Ticket that is not an Epic and leaves it where it is', () => {
    const { tickets, project, beta } = setup();
    const plain = tickets.createTicket({
      projectId: project.id,
      title: 'Plain',
    });

    const result = tickets.moveTicketsToCycle({
      cycleId: beta.id,
      ticketNumbers: [plain.number],
      withChildren: true,
    });

    expect(result).toMatchObject({
      updated: [],
      failed: [
        {
          number: plain.number,
          error: `Ticket T${plain.number} is not an Epic. Only an Epic has children to take along.`,
        },
      ],
      children: [],
    });
    expect(tickets.getTicket(plain.number).cycle).toBeNull();
  });

  it('changes nothing when the Epic is in another Project than the move', () => {
    const { tickets, beta, epic, child } = setup();
    const a = child();
    const other = tickets.createProject({ name: 'Blog' });

    const result = tickets.moveTicketsToCycle({
      cycleId: null,
      ticketNumbers: [epic.number],
      projectId: other.id,
      withChildren: true,
    });

    expect(result.failed).toHaveLength(1);
    expect(tickets.getTicket(a.number).cycle).toBeNull();
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([]);
  });

  it('announces each touched Cycle once', () => {
    const { tickets, beta, gamma, epic, child } = setup();
    child('Todo', gamma.id);
    child('Todo', gamma.id);
    const changes: Change[] = [];
    tickets.subscribe((change) => changes.push(change));

    tickets.moveTicketsToCycle({
      cycleId: beta.id,
      ticketNumbers: [epic.number],
      withChildren: true,
    });

    expect(changes).toHaveLength(2);
    expect(changes).toContainEqual({ type: 'cycle', id: beta.id });
    expect(changes).toContainEqual({ type: 'cycle', id: gamma.id });
  });
});

describe('Moving an Epic with its children, edge cases', () => {
  it('puts the children back when the Epic itself cannot be planned', () => {
    const { tickets, beta, gamma, epic, child } = setup();
    tickets.planTicket({ cycleId: gamma.id, number: epic.number });
    const a = child('Todo', gamma.id);
    const b = child();

    const result = tickets.planTickets({
      cycleId: beta.id,
      ticketNumbers: [epic.number],
      withChildren: true,
    });

    expect(result).toMatchObject({ updated: [], children: [] });
    expect(result.failed).toHaveLength(1);
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([]);
    expect(tickets.getCycle(gamma.id).ticketNumbers).toEqual([
      epic.number,
      a.number,
    ]);
    expect(tickets.getTicket(b.number).cycle).toBeNull();
  });

  it('still pulls in the children of an Epic already in the Cycle', () => {
    const { tickets, beta, epic, child } = setup();
    tickets.planTicket({ cycleId: beta.id, number: epic.number });
    const a = child();

    const result = tickets.moveTicketsToCycle({
      cycleId: beta.id,
      ticketNumbers: [epic.number],
      withChildren: true,
    });

    expect(result).toMatchObject({
      updated: [epic.number],
      children: [a.number],
    });
    expect(tickets.getCycle(beta.id).ticketNumbers).toEqual([
      epic.number,
      a.number,
    ]);
  });
});
