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
    const plain = tickets.createTicket({ projectId: project.id, title: 'Plain' });

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
