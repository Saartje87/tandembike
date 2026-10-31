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

const bytes = (text: string) => new TextEncoder().encode(text);

describe('Attachments on Tickets', () => {
  it('adds an Attachment, lists it on the full Ticket without content and gets it back', () => {
    const { tickets, ticket } = ticketsWithOne();

    const attachment = tickets.addAttachment(ticket.number, {
      name: 'notes.txt',
      mediaType: 'text/plain',
      content: bytes('hello'),
      author: 'agent',
    });

    expect(attachment).toEqual({
      id: expect.any(Number),
      ticketNumber: ticket.number,
      name: 'notes.txt',
      mediaType: 'text/plain',
      size: 5,
      author: 'agent',
      createdAt: expect.any(Date),
    });
    expect(tickets.getTicket(ticket.number).attachments).toEqual([attachment]);
    const stored = tickets.getAttachment(attachment.id);
    expect(stored).toEqual({ ...attachment, content: expect.anything() });
    expect(new TextDecoder().decode(stored.content)).toBe('hello');
  });

  it('lists Attachments in the order they were added', () => {
    const { tickets, ticket } = ticketsWithOne();

    for (const name of ['b.txt', 'a.txt', 'c.txt']) {
      tickets.addAttachment(ticket.number, {
        name,
        content: bytes(name),
        author: 'user',
      });
    }

    expect(
      tickets.getTicket(ticket.number).attachments.map(({ name }) => name),
    ).toEqual(['b.txt', 'a.txt', 'c.txt']);
  });

  it('refuses an unknown Attachment and an unknown Ticket', () => {
    const { tickets } = ticketsWithOne();

    expect(errorFrom(() => tickets.getAttachment(99))).toEqual(
      new NotFoundError('There is no Attachment 99.'),
    );
    expect(
      errorFrom(() =>
        tickets.addAttachment(99, {
          name: 'a.txt',
          content: bytes('a'),
          author: 'user',
        }),
      ),
    ).toEqual(new NotFoundError('There is no Ticket T99.'));
  });

  it('trims the name and refuses an empty, multi-line or overlong one', () => {
    const { tickets, ticket } = ticketsWithOne();
    const add = (name: string) => () =>
      tickets.addAttachment(ticket.number, {
        name,
        content: bytes('a'),
        author: 'user',
      });

    expect(add('  a.txt \t')().name).toBe('a.txt');
    expect(errorFrom(add('  '))).toEqual(
      new ValidationError({ name: 'Enter a file name.' }),
    );
    expect(errorFrom(add('a\nb.txt'))).toEqual(
      new ValidationError({ name: 'Keep the file name to one line.' }),
    );
    expect(errorFrom(add('x'.repeat(256)))).toEqual(
      new ValidationError({
        name: 'Keep the file name to 255 characters or fewer.',
      }),
    );
    expect(add('x'.repeat(255))().name).toHaveLength(255);
  });

  it('refuses empty content and content over 10 MB', () => {
    const { tickets, ticket } = ticketsWithOne();
    const add = (content: Uint8Array) => () =>
      tickets.addAttachment(ticket.number, {
        name: 'a.bin',
        content,
        author: 'user',
      });

    expect(errorFrom(add(new Uint8Array(0)))).toEqual(
      new ValidationError({ content: 'The file is empty.' }),
    );
    expect(errorFrom(add(new Uint8Array(10 * 1024 * 1024 + 1)))).toEqual(
      new ValidationError({
        content: 'Keep the file to 10 MB or smaller.',
      }),
    );
    expect(add(new Uint8Array(10 * 1024 * 1024))().size).toBe(10 * 1024 * 1024);
  });

  it('refuses a 51st Attachment', () => {
    const { tickets, ticket } = ticketsWithOne();
    const add = () =>
      tickets.addAttachment(ticket.number, {
        name: 'a.txt',
        content: bytes('a'),
        author: 'user',
      });
    for (let i = 0; i < 50; i += 1) {
      add();
    }

    expect(errorFrom(add)).toEqual(
      new ValidationError({
        attachments: 'A Ticket can have at most 50 Attachments.',
      }),
    );
    expect(tickets.getTicket(ticket.number).attachments).toHaveLength(50);
  });

  it('allows two Attachments with the same name', () => {
    const { tickets, ticket } = ticketsWithOne();

    const [first, second] = [1, 2].map(() =>
      tickets.addAttachment(ticket.number, {
        name: 'screenshot.png',
        content: bytes('x'),
        author: 'user',
      }),
    );

    expect(first.id).not.toBe(second.id);
    expect(tickets.getTicket(ticket.number).attachments).toHaveLength(2);
  });

  it("takes the media type from the given one, else the name's extension, else octet-stream", () => {
    const { tickets, ticket } = ticketsWithOne();
    const mediaTypeOf = (name: string, mediaType?: string) =>
      tickets.addAttachment(ticket.number, {
        name,
        mediaType,
        content: bytes('x'),
        author: 'agent',
      }).mediaType;

    expect(mediaTypeOf('a.png')).toBe('image/png');
    expect(mediaTypeOf('a.JPG')).toBe('image/jpeg');
    expect(mediaTypeOf('a.json')).toBe('application/json');
    expect(mediaTypeOf('a.txt')).toBe('text/plain');
    expect(mediaTypeOf('a.weird')).toBe('application/octet-stream');
    expect(mediaTypeOf('noextension')).toBe('application/octet-stream');
    expect(mediaTypeOf('a.png', 'image/webp')).toBe('image/webp');
    expect(mediaTypeOf('a.png', '  ')).toBe('image/png');
  });

  it('stores a given media type lower-cased and refuses one that is not a bare type/subtype', () => {
    const { tickets, ticket } = ticketsWithOne();
    const add = (mediaType: string) => () =>
      tickets.addAttachment(ticket.number, {
        name: 'a.bin',
        mediaType,
        content: bytes('x'),
        author: 'agent',
      });

    expect(add('  Image/SVG+XML ')().mediaType).toBe('image/svg+xml');
    for (const bad of [
      'text/plain; charset=utf-8',
      'text',
      'text/',
      '/plain',
      'text/plain/extra',
      'te xt/plain',
      'text/pl\nain',
      'text/*',
    ]) {
      expect(errorFrom(add(bad))).toEqual(
        new ValidationError({
          mediaType:
            'Use a media type such as text/plain, without parameters or spaces.',
        }),
      );
    }
    expect(tickets.getTicket(ticket.number).attachments).toHaveLength(1);
  });

  it('records an Activity entry naming the file, by the module actor', () => {
    const tickets = createTestTickets(undefined, 'agent');
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'T' });

    tickets.addAttachment(ticket.number, {
      name: 'log.txt',
      content: bytes('x'),
      author: 'agent',
    });

    expect(tickets.listActivity(ticket.number).at(-1)).toMatchObject({
      actor: 'agent',
      changes: [{ type: 'attachmentAdded', name: 'log.txt' }],
    });
  });

  it('leaves no Activity or Attachment when refused', () => {
    const { tickets, ticket } = ticketsWithOne();
    const before = tickets.listActivity(ticket.number).length;

    errorFrom(() =>
      tickets.addAttachment(ticket.number, {
        name: '',
        content: bytes('x'),
        author: 'user',
      }),
    );

    expect(tickets.listActivity(ticket.number)).toHaveLength(before);
    expect(tickets.getTicket(ticket.number).attachments).toEqual([]);
  });

  it('announces a change to the Ticket, and nothing when refused', () => {
    const changes = createChangeChannel();
    const tickets = createTestTickets(changes);
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'T' });
    const listener = vi.fn();
    changes.subscribe(listener);

    tickets.addAttachment(ticket.number, {
      name: 'a.txt',
      content: bytes('x'),
      author: 'user',
    });
    errorFrom(() =>
      tickets.addAttachment(ticket.number, {
        name: '',
        content: bytes('x'),
        author: 'user',
      }),
    );

    expect(listener.mock.calls).toEqual([
      [{ type: 'ticket', number: ticket.number }],
    ]);
  });

  it('works on an Epic', () => {
    const { tickets, project } = ticketsWithOne();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Epic',
      type: 'Epic',
    });

    tickets.addAttachment(epic.number, {
      name: 'a.txt',
      content: bytes('x'),
      author: 'user',
    });

    expect(tickets.getTicket(epic.number).attachments).toHaveLength(1);
  });

  it('keeps Attachments when the Ticket is archived and restored, and destroys them with a deleted Ticket', () => {
    const { tickets, ticket } = ticketsWithOne();
    const attachment = tickets.addAttachment(ticket.number, {
      name: 'a.txt',
      content: bytes('x'),
      author: 'user',
    });

    tickets.archiveTicket(ticket.number);
    expect(tickets.getTicket(ticket.number).attachments).toHaveLength(1);
    tickets.restoreTicket(ticket.number);
    expect(tickets.getTicket(ticket.number).attachments).toHaveLength(1);

    tickets.deleteTicket(ticket.number);
    expect(errorFrom(() => tickets.getAttachment(attachment.id))).toEqual(
      new NotFoundError(`There is no Attachment ${attachment.id}.`),
    );
  });

  it('refuses adding to a Ticket in an archived Project', () => {
    const { tickets, project, ticket } = ticketsWithOne();
    tickets.archiveProject(project.id);

    expect(
      errorFrom(() =>
        tickets.addAttachment(ticket.number, {
          name: 'a.txt',
          content: bytes('x'),
          author: 'user',
        }),
      ),
    ).toBeInstanceOf(NotAllowedError);
  });

  describe('removing', () => {
    const added = (author: 'user' | 'agent') => {
      const { tickets, project, ticket } = ticketsWithOne();
      const attachment = tickets.addAttachment(ticket.number, {
        name: ' shot.png ',
        content: bytes('x'),
        author,
      });
      return { tickets, project, ticket, attachment };
    };

    it('lets the User remove any Attachment for good and records the file name', () => {
      for (const author of ['user', 'agent'] as const) {
        const { tickets, ticket, attachment } = added(author);

        tickets.removeAttachment(attachment.id, { by: 'user' });

        expect(tickets.getTicket(ticket.number).attachments).toEqual([]);
        expect(
          errorFrom(() => tickets.getAttachment(attachment.id)),
        ).toBeInstanceOf(NotFoundError);
        expect(tickets.listActivity(ticket.number).at(-1)).toMatchObject({
          actor: 'user',
          changes: [{ type: 'attachmentRemoved', name: 'shot.png' }],
        });
      }
    });

    it('lets an Agent remove only an Attachment an Agent added', () => {
      const mine = added('agent');
      mine.tickets.removeAttachment(mine.attachment.id, { by: 'agent' });
      expect(mine.tickets.getTicket(mine.ticket.number).attachments).toEqual(
        [],
      );

      const users = added('user');
      const error = errorFrom(() =>
        users.tickets.removeAttachment(users.attachment.id, { by: 'agent' }),
      );
      expect(error).toBeInstanceOf(NotAllowedError);
      expect((error as Error).message).toMatch(
        /written by the User|added by the User/,
      );
      expect(
        users.tickets.getTicket(users.ticket.number).attachments,
      ).toHaveLength(1);
    });

    it('refuses an unknown id and a Ticket in an archived Project', () => {
      const { tickets, project, attachment } = added('user');
      expect(
        errorFrom(() => tickets.removeAttachment(99, { by: 'user' })),
      ).toEqual(new NotFoundError('There is no Attachment 99.'));

      tickets.archiveProject(project.id);
      expect(
        errorFrom(() =>
          tickets.removeAttachment(attachment.id, { by: 'user' }),
        ),
      ).toBeInstanceOf(NotAllowedError);
    });

    it('announces a change to the Ticket, and nothing when refused', () => {
      const changes = createChangeChannel();
      const tickets = createTestTickets(changes);
      const project = tickets.createProject({ name: 'Website' });
      const ticket = tickets.createTicket({
        projectId: project.id,
        title: 'T',
      });
      const attachment = tickets.addAttachment(ticket.number, {
        name: 'a.txt',
        content: bytes('x'),
        author: 'user',
      });
      const listener = vi.fn();
      changes.subscribe(listener);

      errorFrom(() => tickets.removeAttachment(99, { by: 'user' }));
      tickets.removeAttachment(attachment.id, { by: 'user' });

      expect(listener.mock.calls).toEqual([
        [{ type: 'ticket', number: ticket.number }],
      ]);
    });
  });
});
