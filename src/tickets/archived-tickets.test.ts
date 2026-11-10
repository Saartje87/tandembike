import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotAllowedError } from './errors';

const bytes = (text: string) => new TextEncoder().encode(text);

/** An archived Ticket in a live Project, with a criterion, comment and Attachment. */
function archivedTicket() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const ticket = tickets.createTicket({
    projectId: project.id,
    title: 'Fix the header',
    labels: ['bug'],
    acceptanceCriteria: [{ text: 'The header fits' }],
  });
  const comment = tickets.addComment(ticket.number, {
    body: 'Hi',
    author: 'user',
  });
  const attachment = tickets.addAttachment(ticket.number, {
    name: 'notes.txt',
    mediaType: 'text/plain',
    content: bytes('hello'),
    author: 'user',
  });
  tickets.archiveTicket(ticket.number);
  return {
    tickets,
    project,
    ticket: tickets.getTicket(ticket.number),
    comment,
    attachment,
  };
}

/** A Ticket claimed by `run-1`, then archived, in a live Project. */
function claimedArchivedTicket() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const created = tickets.createTicket({ projectId: project.id, title: 'A' });
  tickets.claimTicket(created.number, { agentRunId: 'run-1' });
  tickets.archiveTicket(created.number);
  return { tickets, project, ticket: tickets.getTicket(created.number) };
}

const refused = (number: number) =>
  new NotAllowedError(
    `Ticket T${number} is archived. Restore it before changing it.`,
  );

describe('An archived Ticket is read-only', () => {
  it('refuses field and Status changes, changing nothing', () => {
    const { tickets, ticket } = archivedTicket();

    expect(
      errorFrom(() => tickets.updateTicket(ticket.number, { title: 'New' })),
    ).toEqual(refused(ticket.number));
    expect(
      errorFrom(() => tickets.updateTicket(ticket.number, { status: 'Done' })),
    ).toEqual(refused(ticket.number));
    expect(errorFrom(() => tickets.completeTicket(ticket.number))).toEqual(
      refused(ticket.number),
    );
    expect(errorFrom(() => tickets.backToTodo(ticket.number))).toEqual(
      refused(ticket.number),
    );
    expect(tickets.getTicket(ticket.number)).toEqual(ticket);
  });

  it('refuses label and External reference changes', () => {
    const { tickets, ticket } = archivedTicket();

    expect(errorFrom(() => tickets.addLabels(ticket.number, ['ui']))).toEqual(
      refused(ticket.number),
    );
    expect(
      errorFrom(() => tickets.removeLabels(ticket.number, ['bug'])),
    ).toEqual(refused(ticket.number));
    expect(
      errorFrom(() =>
        tickets.updateTicket(ticket.number, { addLabels: ['ui'] }),
      ),
    ).toEqual(refused(ticket.number));
    expect(
      errorFrom(() => tickets.addExternalReferences(ticket.number, ['ABC-1'])),
    ).toEqual(refused(ticket.number));
    expect(tickets.getTicket(ticket.number)).toEqual(ticket);
  });

  it('refuses claiming it, by another run or its holder', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    tickets.claimTicket(ticket.number, { agentRunId: 'run-1' });
    tickets.archiveTicket(ticket.number);

    expect(
      errorFrom(() =>
        tickets.claimTicket(ticket.number, { agentRunId: 'run-2' }),
      ),
    ).toEqual(refused(ticket.number));
    expect(
      errorFrom(() =>
        tickets.claimTicket(ticket.number, { agentRunId: 'run-1' }),
      ),
    ).toEqual(refused(ticket.number));
    expect(tickets.getTicket(ticket.number).claim?.agentRunId).toBe('run-1');
  });

  it('refuses criteria changes', () => {
    const { tickets, ticket } = archivedTicket();
    const [criterion] = ticket.acceptanceCriteria;

    expect(
      errorFrom(() =>
        tickets.setAcceptanceCriteriaChecked(ticket.number, [
          { id: criterion.id, checked: true },
        ]),
      ),
    ).toEqual(refused(ticket.number));
    expect(
      errorFrom(() =>
        tickets.updateTicket(ticket.number, {
          acceptanceCriteria: [{ text: 'Other' }],
        }),
      ),
    ).toEqual(refused(ticket.number));
    expect(tickets.getTicket(ticket.number)).toEqual(ticket);
  });

  it('refuses Blocker and Epic changes on it', () => {
    const { tickets, project, ticket } = archivedTicket();
    const other = tickets.createTicket({ projectId: project.id, title: 'B' });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Epic',
      type: 'Epic',
    });

    expect(
      errorFrom(() =>
        tickets.addBlocker({ blocker: other.number, blocked: ticket.number }),
      ),
    ).toEqual(refused(ticket.number));
    expect(
      errorFrom(() =>
        tickets.attachTicketsToEpic({
          epic: epic.number,
          children: [ticket.number],
        }),
      ),
    ).toEqual(refused(ticket.number));
  });

  it('names the archived Project first when both are archived', () => {
    const { tickets, project, ticket } = archivedTicket();
    tickets.archiveProject(project.id);

    expect(
      errorFrom(() => tickets.updateTicket(ticket.number, { title: 'New' })),
    ).toEqual(
      new NotAllowedError(
        `Ticket T${ticket.number} is in the archived Project "Website". Restore the Project before changing its Tickets.`,
      ),
    );
  });
});

describe('What an archived Ticket still allows', () => {
  it('restores it, after which it changes again', () => {
    const { tickets, ticket } = archivedTicket();

    expect(tickets.restoreTicket(ticket.number).archived).toBe(false);
    expect(tickets.updateTicket(ticket.number, { title: 'New' }).title).toBe(
      'New',
    );
  });

  it('archives it again', () => {
    const { tickets, ticket } = archivedTicket();

    expect(tickets.archiveTicket(ticket.number).archived).toBe(true);
  });

  it('adds, edits and removes comments', () => {
    const { tickets, ticket, comment } = archivedTicket();

    const added = tickets.addComment(ticket.number, {
      body: 'Still here',
      author: 'agent',
    });
    tickets.editComment(comment.id, { body: 'Hello', by: 'user' });
    tickets.removeComment(added.id, { by: 'user' });

    expect(tickets.listComments(ticket.number).map(({ body }) => body)).toEqual(
      ['Hello'],
    );
  });

  it('adds and removes Attachments', () => {
    const { tickets, ticket, attachment } = archivedTicket();

    const added = tickets.addAttachment(ticket.number, {
      name: 'more.txt',
      mediaType: 'text/plain',
      content: bytes('more'),
      author: 'agent',
    });
    tickets.removeAttachment(attachment.id, { by: 'user' });

    expect(
      tickets.getTicket(ticket.number).attachments.map(({ id }) => id),
    ).toEqual([added.id]);
  });

  it('keeps its Claim when it is archived', () => {
    const { tickets, ticket } = claimedArchivedTicket();

    expect(ticket.archived).toBe(true);
    expect(ticket.claim?.agentRunId).toBe('run-1');
  });

  it('releases its Claim by the holding run, recording the Activity', () => {
    const { tickets, ticket } = claimedArchivedTicket();

    const released = tickets.releaseTicketClaim(ticket.number, {
      agentRunId: 'run-1',
    });

    expect(released).toMatchObject({ archived: true, claim: null });
    expect(tickets.listActivity(ticket.number).at(-1)?.changes).toEqual([
      { type: 'claimReleased', agentRunId: 'run-1', agentName: null },
    ]);
  });

  it("still refuses releasing another run's Claim", () => {
    const { tickets, ticket } = claimedArchivedTicket();

    expect(
      errorFrom(() =>
        tickets.releaseTicketClaim(ticket.number, { agentRunId: 'run-2' }),
      ),
    ).toBeInstanceOf(NotAllowedError);
    expect(tickets.getTicket(ticket.number).claim?.agentRunId).toBe('run-1');
  });

  it('clears its Claim for the User, recording the Activity', () => {
    const { tickets, ticket } = claimedArchivedTicket();

    expect(tickets.clearTicketClaim(ticket.number).claim).toBeNull();
    expect(tickets.listActivity(ticket.number).at(-1)?.changes).toEqual([
      { type: 'claimCleared', agentRunId: 'run-1', agentName: null },
    ]);
  });

  it('abandons work on it: comments, releases and keeps the Status', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    tickets.startWork(ticket.number, 'run-1');
    tickets.archiveTicket(ticket.number);

    const result = tickets.abandonWork(ticket.number, 'run-1', 'Archived');

    expect(result).toMatchObject({
      archived: true,
      status: 'In progress',
      claim: null,
    });
    expect(tickets.listComments(ticket.number).map(({ body }) => body)).toEqual(
      ['Archived'],
    );
  });

  it('refuses releasing or clearing its Claim in an archived Project', () => {
    const { tickets, project, ticket } = claimedArchivedTicket();
    tickets.archiveProject(project.id);
    const projectRefused = new NotAllowedError(
      `Ticket T${ticket.number} is in the archived Project "Website". Restore the Project before changing its Tickets.`,
    );

    expect(
      errorFrom(() =>
        tickets.releaseTicketClaim(ticket.number, { agentRunId: 'run-1' }),
      ),
    ).toEqual(projectRefused);
    expect(errorFrom(() => tickets.clearTicketClaim(ticket.number))).toEqual(
      projectRefused,
    );
    expect(
      errorFrom(() => tickets.abandonWork(ticket.number, 'run-1', 'Gone')),
    ).toEqual(projectRefused);
    expect(tickets.getTicket(ticket.number).claim?.agentRunId).toBe('run-1');
    expect(tickets.listComments(ticket.number)).toEqual([]);
  });

  it('deletes it', () => {
    const { tickets, ticket } = archivedTicket();

    tickets.deleteTicket(ticket.number);

    expect(tickets.findTickets({ includeArchived: true }).tickets).toEqual([]);
  });
});
