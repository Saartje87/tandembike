// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
import { NameTakenError, NotAllowedError, NotFoundError } from './errors';

/** A Project with one Ticket, archived, and an active Project beside it. */
function archivedProjectWithTicket() {
  const tickets = createTestTickets();
  const archived = tickets.createProject({ name: 'Old site' });
  const active = tickets.createProject({ name: 'Website' });
  const ticket = tickets.createTicket({
    projectId: archived.id,
    title: 'Fix the header',
    acceptanceCriteria: [{ text: 'The header fits' }],
  });
  tickets.archiveProject(archived.id);
  return { tickets, archived, active, ticket };
}

const archivedTicket = (number: number) =>
  new NotAllowedError(
    `Ticket T${number} is in the archived Project "Old site". Restore the Project before changing its Tickets.`,
  );

const archivedProject = new NotAllowedError(
  'The Project "Old site" is archived. Restore it before changing it or its Tickets.',
);

describe('Archiving a Project', () => {
  it('marks the Project archived and keeps listing it', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Old site' });

    const archived = tickets.archiveProject(project.id);

    expect(archived).toEqual({ ...project, archived: true });
    expect(tickets.getProject(project.id).archived).toBe(true);
    expect(tickets.listProjects()).toEqual([archived]);
  });

  it('lists new Projects as not archived', () => {
    const tickets = createTestTickets();

    expect(tickets.createProject({ name: 'Website' }).archived).toBe(false);
  });

  it('leaves its Tickets as they were', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Old site' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      status: 'In progress',
    });

    tickets.archiveProject(project.id);

    expect(tickets.getTicket(ticket.number)).toEqual(ticket);
  });

  it('changes nothing when the Project is archived already', () => {
    const { tickets, archived } = archivedProjectWithTicket();

    expect(tickets.archiveProject(archived.id).archived).toBe(true);
  });

  it('says when the Project does not exist', () => {
    const tickets = createTestTickets();

    expect(errorFrom(() => tickets.archiveProject(9))).toEqual(
      new NotFoundError('There is no Project with id 9.'),
    );
  });

  it('announces the archived Project', () => {
    const changes = createChangeChannel();
    const tickets = createTestTickets(changes);
    const project = tickets.createProject({ name: 'Old site' });
    const listener = vi.fn();
    changes.subscribe(listener);

    tickets.archiveProject(project.id);

    expect(listener).toHaveBeenCalledWith({ type: 'project', id: project.id });
  });

  it('keeps its name reserved', () => {
    const { tickets } = archivedProjectWithTicket();

    expect(
      errorFrom(() => tickets.createProject({ name: 'old SITE' })),
    ).toEqual(new NameTakenError('Old site'));
  });
});

describe('Restoring a Project', () => {
  it('brings the Project and its Tickets back unchanged', () => {
    const { tickets, archived, ticket } = archivedProjectWithTicket();

    const restored = tickets.restoreProject(archived.id);

    expect(restored).toEqual({ ...archived, archived: false });
    expect(tickets.getTicket(ticket.number)).toEqual(ticket);
    expect(tickets.findTickets().tickets.map(({ number }) => number)).toEqual([
      ticket.number,
    ]);
  });

  it('makes its Tickets changeable again', () => {
    const { tickets, archived, ticket } = archivedProjectWithTicket();
    tickets.restoreProject(archived.id);

    expect(tickets.updateTicket(ticket.number, { status: 'Done' }).status).toBe(
      'Done',
    );
  });

  it('changes nothing when the Project is not archived', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(tickets.restoreProject(project.id)).toEqual(project);
  });

  it('says when the Project does not exist', () => {
    const tickets = createTestTickets();

    expect(errorFrom(() => tickets.restoreProject(9))).toEqual(
      new NotFoundError('There is no Project with id 9.'),
    );
  });

  it('announces the restored Project', () => {
    const changes = createChangeChannel();
    const tickets = createTestTickets(changes);
    const project = tickets.createProject({ name: 'Old site' });
    tickets.archiveProject(project.id);
    const listener = vi.fn();
    changes.subscribe(listener);

    tickets.restoreProject(project.id);

    expect(listener).toHaveBeenCalledWith({ type: 'project', id: project.id });
  });
});

describe('Finding Tickets of an archived Project', () => {
  it('hides them when no Project is named', () => {
    const { tickets, active } = archivedProjectWithTicket();
    const shown = tickets.createTicket({
      projectId: active.id,
      title: 'Shown',
    });

    const page = tickets.findTickets();

    expect(page.tickets.map(({ number }) => number)).toEqual([shown.number]);
    expect(page.total).toBe(1);
    expect(tickets.listTickets().map(({ number }) => number)).toEqual([
      shown.number,
    ]);
  });

  it('lists them with includeArchived', () => {
    const { tickets, ticket } = archivedProjectWithTicket();

    expect(
      tickets
        .findTickets({ includeArchived: true })
        .tickets.map(({ number }) => number),
    ).toEqual([ticket.number]);
  });

  it('lists them when their Project is named, by id or by name', () => {
    const { tickets, archived, ticket } = archivedProjectWithTicket();

    expect(
      tickets
        .findTickets({ projectId: archived.id })
        .tickets.map(({ number }) => number),
    ).toEqual([ticket.number]);
    expect(
      tickets
        .findTickets({ projectName: 'old site' })
        .tickets.map(({ number }) => number),
    ).toEqual([ticket.number]);
  });

  it('still gets one by number', () => {
    const { tickets, ticket } = archivedProjectWithTicket();

    expect(tickets.getTicket(ticket.number)).toEqual(ticket);
  });

  it('keeps listing their labels', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Old site' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      labels: ['bug'],
    });
    tickets.archiveProject(project.id);

    expect(tickets.listLabels()).toEqual(['bug']);
  });
});

describe('An archived Project is read-only', () => {
  it('refuses renaming it', () => {
    const { tickets, archived } = archivedProjectWithTicket();

    expect(
      errorFrom(() => tickets.renameProject(archived.id, { name: 'Older' })),
    ).toEqual(archivedProject);
  });

  it('refuses changing its colour or icon', () => {
    const { tickets, archived } = archivedProjectWithTicket();

    expect(
      errorFrom(() => tickets.styleProject(archived.id, { color: 'blue' })),
    ).toEqual(archivedProject);
    expect(tickets.getProject(archived.id).color).toBeNull();
  });

  it('refuses creating Tickets in it, one or several', () => {
    const { tickets, archived } = archivedProjectWithTicket();

    expect(
      errorFrom(() =>
        tickets.createTicket({ projectId: archived.id, title: 'New' }),
      ),
    ).toEqual(archivedProject);
    expect(
      errorFrom(() =>
        tickets.createTicketBatch({
          projectId: archived.id,
          tickets: [{ title: 'New' }],
        }),
      ),
    ).toEqual(archivedProject);
  });

  it('refuses moving a Ticket into it', () => {
    const { tickets, archived, active } = archivedProjectWithTicket();
    const ticket = tickets.createTicket({
      projectId: active.id,
      title: 'Move',
    });

    expect(
      errorFrom(() =>
        tickets.updateTicket(ticket.number, { projectId: archived.id }),
      ),
    ).toEqual(archivedProject);
    expect(tickets.getTicket(ticket.number).projectId).toBe(active.id);
  });

  it('refuses changing or moving out its Tickets', () => {
    const { tickets, active, ticket } = archivedProjectWithTicket();

    expect(
      errorFrom(() => tickets.updateTicket(ticket.number, { status: 'Done' })),
    ).toEqual(archivedTicket(ticket.number));
    expect(
      errorFrom(() =>
        tickets.updateTicket(ticket.number, { projectId: active.id }),
      ),
    ).toEqual(archivedTicket(ticket.number));
    expect(tickets.getTicket(ticket.number)).toEqual(ticket);
  });

  it('reports its Tickets as failed in a batch change and changes the others', () => {
    const { tickets, active, ticket } = archivedProjectWithTicket();
    const other = tickets.createTicket({
      projectId: active.id,
      title: 'Other',
    });

    const result = tickets.updateTickets({
      ticketNumbers: [ticket.number, other.number],
      status: 'Done',
    });

    expect(result.updated.map(({ number }) => number)).toEqual([other.number]);
    expect(result.failed).toEqual([
      { number: ticket.number, error: archivedTicket(ticket.number).message },
    ]);
  });

  it('refuses changing its Tickets’ labels, criteria and comments', () => {
    const { tickets, ticket } = archivedProjectWithTicket();
    const [criterion] = ticket.acceptanceCriteria;
    const refused = archivedTicket(ticket.number);

    expect(errorFrom(() => tickets.addLabels(ticket.number, ['bug']))).toEqual(
      refused,
    );
    expect(
      errorFrom(() => tickets.removeLabels(ticket.number, ['bug'])),
    ).toEqual(refused);
    expect(
      errorFrom(() =>
        tickets.setAcceptanceCriteriaChecked(ticket.number, [
          { id: criterion.id, checked: true },
        ]),
      ),
    ).toEqual(refused);
    expect(
      errorFrom(() =>
        tickets.addComment(ticket.number, { body: 'Hi', author: 'user' }),
      ),
    ).toEqual(refused);
  });

  it('refuses editing or removing comments on its Tickets', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Old site' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    const comment = tickets.addComment(ticket.number, {
      body: 'Hi',
      author: 'user',
    });
    tickets.archiveProject(project.id);

    expect(
      errorFrom(() =>
        tickets.editComment(comment.id, { body: 'Hello', by: 'user' }),
      ),
    ).toEqual(archivedTicket(ticket.number));
    expect(
      errorFrom(() => tickets.removeComment(comment.id, { by: 'user' })),
    ).toEqual(archivedTicket(ticket.number));
  });

  it('refuses claiming its Tickets or changing their Claims', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Old site' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    const claimed = tickets.createTicket({ projectId: project.id, title: 'B' });
    tickets.claimTicket(claimed.number, { agentRunId: 'run-1' });
    tickets.archiveProject(project.id);

    expect(
      errorFrom(() =>
        tickets.claimTicket(ticket.number, { agentRunId: 'run-1' }),
      ),
    ).toEqual(archivedTicket(ticket.number));
    expect(
      errorFrom(() =>
        tickets.releaseTicketClaim(claimed.number, { agentRunId: 'run-1' }),
      ),
    ).toEqual(archivedTicket(claimed.number));
    expect(errorFrom(() => tickets.clearTicketClaim(claimed.number))).toEqual(
      archivedTicket(claimed.number),
    );
  });

  it('refuses archiving, restoring or deleting its Tickets', () => {
    const { tickets, ticket } = archivedProjectWithTicket();

    expect(errorFrom(() => tickets.archiveTicket(ticket.number))).toEqual(
      archivedTicket(ticket.number),
    );
    expect(errorFrom(() => tickets.restoreTicket(ticket.number))).toEqual(
      archivedTicket(ticket.number),
    );
    expect(errorFrom(() => tickets.deleteTicket(ticket.number))).toEqual(
      archivedTicket(ticket.number),
    );
  });

  it('refuses reordering its Board', () => {
    const { tickets, archived, ticket } = archivedProjectWithTicket();

    expect(
      errorFrom(() =>
        tickets.reorderTickets({
          projectId: archived.id,
          status: 'Todo',
          ticketNumbers: [ticket.number],
        }),
      ),
    ).toEqual(archivedProject);
  });

  it('refuses attaching its Tickets to an Epic or detaching them', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Old site' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Epic',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Child',
      epicNumber: epic.number,
    });
    const loose = tickets.createTicket({ projectId: project.id, title: 'L' });
    tickets.archiveProject(project.id);

    expect(
      errorFrom(() =>
        tickets.attachToEpic({ epic: epic.number, child: loose.number }),
      ),
    ).toEqual(archivedTicket(loose.number));
    expect(
      errorFrom(() =>
        tickets.moveToEpic({ epic: epic.number, child: loose.number }),
      ),
    ).toEqual(archivedTicket(loose.number));
    expect(errorFrom(() => tickets.detachFromEpic(child.number))).toEqual(
      archivedTicket(child.number),
    );
  });

  it('refuses Blocker changes on its Tickets, but lets another Project drop one', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Old site' });
    const active = tickets.createProject({ name: 'Website' });
    const old = tickets.createTicket({ projectId: project.id, title: 'Old' });
    const current = tickets.createTicket({
      projectId: active.id,
      title: 'Cur',
    });
    tickets.addBlocker({ blocker: old.number, blocked: current.number });
    tickets.archiveProject(project.id);

    expect(
      errorFrom(() =>
        tickets.addBlocker({ blocker: current.number, blocked: old.number }),
      ),
    ).toEqual(archivedTicket(old.number));
    expect(
      tickets.removeBlocker({ blocker: old.number, blocked: current.number })
        .blockedBy,
    ).toEqual([]);
  });

  it('refuses changing its Cycles or planning into them', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Old site' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    const prepared = tickets.createCycle({
      projectId: project.id,
      title: 'Next',
    });
    const active = tickets.createCycle({ projectId: project.id, title: 'Now' });
    tickets.startCycle(active.id);
    tickets.archiveProject(project.id);
    const plan = { cycleId: prepared.id, ticketNumbers: [ticket.number] };

    expect(
      errorFrom(() =>
        tickets.createCycle({ projectId: project.id, title: 'Later' }),
      ),
    ).toEqual(archivedProject);
    expect(
      errorFrom(() => tickets.renameCycle(prepared.id, { title: 'Soon' })),
    ).toEqual(archivedProject);
    expect(errorFrom(() => tickets.discardCycle(prepared.id))).toEqual(
      archivedProject,
    );
    expect(
      errorFrom(() => tickets.startCycle(prepared.id, { archiveActive: true })),
    ).toEqual(archivedProject);
    expect(errorFrom(() => tickets.archiveCycle(active.id))).toEqual(
      archivedProject,
    );
    expect(
      errorFrom(() =>
        tickets.planTicket({ cycleId: prepared.id, number: ticket.number }),
      ),
    ).toEqual(archivedProject);
    expect(errorFrom(() => tickets.planTickets(plan))).toEqual(archivedProject);
    expect(errorFrom(() => tickets.unplanTickets(plan))).toEqual(
      archivedProject,
    );
  });

  it('still lists its Cycles', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Old site' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Next' });
    tickets.archiveProject(project.id);

    expect(tickets.listCycles(project.id)).toEqual([cycle]);
  });
});
