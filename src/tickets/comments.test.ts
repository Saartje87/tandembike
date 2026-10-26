// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';

function ticketsWithOne() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const ticket = tickets.createTicket({
    projectId: project.id,
    title: 'Fix the header',
  });
  return { tickets, project, ticket };
}

describe('Commenting on Tickets', () => {
  it('adds a comment and lists it on its Ticket', () => {
    const { tickets, ticket } = ticketsWithOne();

    const comment = tickets.addComment(ticket.number, {
      body: 'Started on the **header**.',
      author: 'agent',
    });

    expect(comment).toEqual({
      id: expect.any(Number),
      ticketNumber: ticket.number,
      author: 'agent',
      body: 'Started on the **header**.',
      createdAt: expect.any(Date),
      editedAt: null,
    });
    expect(tickets.listComments(ticket.number)).toEqual([comment]);
  });

  it('trims the body and refuses an empty or overlong one', () => {
    const { tickets, ticket } = ticketsWithOne();

    const comment = tickets.addComment(ticket.number, {
      body: '  Done.\n',
      author: 'user',
    });

    expect(comment.body).toBe('Done.');
    expect(
      errorFrom(() =>
        tickets.addComment(ticket.number, { body: ' \n ', author: 'user' }),
      ),
    ).toEqual(new ValidationError({ body: 'Enter a comment.' }));
    expect(
      errorFrom(() =>
        tickets.addComment(ticket.number, {
          body: 'x'.repeat(50_001),
          author: 'user',
        }),
      ),
    ).toEqual(
      new ValidationError({
        body: 'Keep the comment to 50,000 characters or fewer.',
      }),
    );
    expect(tickets.listComments(ticket.number)).toEqual([comment]);
  });

  it('refuses comments on a Ticket that does not exist', () => {
    const tickets = createTestTickets();

    expect(
      errorFrom(() => tickets.addComment(9, { body: 'Hi', author: 'user' })),
    ).toEqual(new NotFoundError('There is no Ticket T9.'));
    expect(errorFrom(() => tickets.listComments(9))).toEqual(
      new NotFoundError('There is no Ticket T9.'),
    );
  });

  it("lists only the Ticket's own comments, oldest first", () => {
    const { tickets, project, ticket } = ticketsWithOne();
    const other = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the footer',
    });
    tickets.addComment(ticket.number, { body: 'First', author: 'user' });
    tickets.addComment(other.number, { body: 'Elsewhere', author: 'user' });
    tickets.addComment(ticket.number, { body: 'Second', author: 'agent' });

    expect(tickets.listComments(ticket.number).map(({ body }) => body)).toEqual(
      ['First', 'Second'],
    );
  });

  it('edits a comment, keeping its created time and noting the edit time', () => {
    const { tickets, ticket } = ticketsWithOne();
    const comment = tickets.addComment(ticket.number, {
      body: 'Started.',
      author: 'agent',
    });

    const edited = tickets.editComment(comment.id, {
      body: ' Started on the header. ',
      by: 'agent',
    });

    expect(edited).toEqual({
      ...comment,
      body: 'Started on the header.',
      editedAt: expect.any(Date),
    });
    expect(edited.editedAt?.getTime()).toBeGreaterThanOrEqual(
      comment.createdAt.getTime(),
    );
    expect(tickets.listComments(ticket.number)).toEqual([edited]);
    expect(
      errorFrom(() =>
        tickets.editComment(comment.id, { body: '', by: 'user' }),
      ),
    ).toEqual(new ValidationError({ body: 'Enter a comment.' }));
  });

  it('removes a comment for good', () => {
    const { tickets, ticket } = ticketsWithOne();
    const kept = tickets.addComment(ticket.number, {
      body: 'Keep',
      author: 'user',
    });
    const removed = tickets.addComment(ticket.number, {
      body: 'Remove',
      author: 'agent',
    });

    tickets.removeComment(removed.id, { by: 'agent' });

    expect(tickets.listComments(ticket.number)).toEqual([kept]);
    expect(
      errorFrom(() =>
        tickets.editComment(removed.id, { body: 'Back', by: 'agent' }),
      ),
    ).toEqual(new NotFoundError(`There is no comment ${removed.id}.`));
    expect(
      errorFrom(() => tickets.removeComment(removed.id, { by: 'agent' })),
    ).toEqual(new NotFoundError(`There is no comment ${removed.id}.`));
  });

  it("lets the User edit and remove an Agent's comments", () => {
    const { tickets, ticket } = ticketsWithOne();
    const comment = tickets.addComment(ticket.number, {
      body: 'By an Agent',
      author: 'agent',
    });

    const edited = tickets.editComment(comment.id, {
      body: 'Fixed by the User',
      by: 'user',
    });
    tickets.removeComment(comment.id, { by: 'user' });

    expect(edited).toMatchObject({
      author: 'agent',
      body: 'Fixed by the User',
    });
    expect(tickets.listComments(ticket.number)).toEqual([]);
  });

  it("refuses to let an Agent edit or remove the User's comments", () => {
    const { tickets, ticket } = ticketsWithOne();
    const comment = tickets.addComment(ticket.number, {
      body: 'By the User',
      author: 'user',
    });
    const refusal = new NotAllowedError(
      `Comment ${comment.id} was written by the User. Agents can only edit or remove comments written by an Agent.`,
    );

    expect(
      errorFrom(() =>
        tickets.editComment(comment.id, { body: 'Changed', by: 'agent' }),
      ),
    ).toEqual(refusal);
    expect(
      errorFrom(() => tickets.removeComment(comment.id, { by: 'agent' })),
    ).toEqual(refusal);
    expect(tickets.listComments(ticket.number)).toEqual([comment]);
  });

  it('announces each comment change as a change to its Ticket', () => {
    const changes = createChangeChannel();
    const listener = vi.fn();
    changes.subscribe(listener);
    const tickets = createTestTickets(changes);
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });
    listener.mockClear();

    const comment = tickets.addComment(ticket.number, {
      body: 'Hi',
      author: 'user',
    });
    tickets.editComment(comment.id, { body: 'Hello', by: 'user' });
    tickets.removeComment(comment.id, { by: 'user' });

    expect(listener.mock.calls).toEqual([
      [{ type: 'ticket', number: ticket.number }],
      [{ type: 'ticket', number: ticket.number }],
      [{ type: 'ticket', number: ticket.number }],
    ]);
  });
});
