// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotFoundError, ValidationError } from './errors';

function ticketsWithOne() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const ticket = tickets.createTicket({
    projectId: project.id,
    title: 'Fix the header',
  });
  return { tickets, project, ticket };
}

describe('External references', () => {
  it('gives a new Ticket none', () => {
    const { ticket } = ticketsWithOne();

    expect(ticket.externalReferences).toEqual([]);
  });

  it('creates a Ticket with references, trimmed, in the order given', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      externalReferences: [
        ' https://github.com/acme/web/issues/87 ',
        'ABC-33',
        '#55',
      ],
    });

    expect(tickets.getTicket(ticket.number).externalReferences).toEqual([
      'https://github.com/acme/web/issues/87',
      'ABC-33',
      '#55',
    ]);
  });

  it('accepts http(s) URLs and keys without spaces', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const references = [
      'http://example.com/a',
      'HTTPS://jira.example.com/browse/ABC-33',
      'owner/repo#55',
      'k'.repeat(100),
      `https://example.com/${'p'.repeat(1980)}`,
    ];

    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      externalReferences: references,
    });

    expect(ticket.externalReferences).toEqual(references);
  });

  it.each([
    ['a javascript: URL', 'javascript:alert(1)'],
    ['an ftp URL', 'ftp://example.com/file'],
    ['a mailto URL', 'mailto:someone@example.com'],
    ['a URL without a host', 'https://'],
    ['a key with a space', 'ABC 33'],
    ['a URL with a space', 'https://example.com/a b'],
    ['a key over 100 characters', 'k'.repeat(101)],
    ['a URL over 2,000 characters', `https://example.com/${'p'.repeat(1981)}`],
  ])('refuses %s', (_, reference) => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(
      errorFrom(() =>
        tickets.createTicket({
          projectId: project.id,
          title: 'Fix the header',
          externalReferences: ['#55', reference],
        }),
      ),
    ).toEqual(
      new ValidationError({
        externalReferences: `"${reference}" is not a valid URL or key. Give an http(s) URL of at most 2,000 characters, or a key without spaces of at most 100 characters, such as #55 or ABC-33.`,
      }),
    );
    expect(tickets.listTickets()).toEqual([]);
  });

  it('refuses an empty reference', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(
      errorFrom(() =>
        tickets.createTicket({
          projectId: project.id,
          title: 'Fix the header',
          externalReferences: ['  '],
        }),
      ),
    ).toEqual(
      new ValidationError({
        externalReferences: 'Enter a URL or key for each External reference.',
      }),
    );
  });

  describe('adding and removing', () => {
    it('adds references after the ones the Ticket has, skipping ones it has', () => {
      const { tickets, ticket } = ticketsWithOne();
      tickets.addExternalReferences(ticket.number, ['#55']);

      const added = tickets.addExternalReferences(ticket.number, [
        ' ABC-33 ',
        '#55',
        'ABC-33',
      ]);

      expect(added.externalReferences).toEqual(['#55', 'ABC-33']);
    });

    it('keeps a key and a URL to the same issue apart, and matches exactly', () => {
      const { tickets, ticket } = ticketsWithOne();

      const added = tickets.addExternalReferences(ticket.number, [
        '#55',
        'https://github.com/acme/web/issues/55',
        'abc-33',
        'ABC-33',
      ]);

      expect(added.externalReferences).toEqual([
        '#55',
        'https://github.com/acme/web/issues/55',
        'abc-33',
        'ABC-33',
      ]);
    });

    it('lets several Tickets share a reference', () => {
      const { tickets, project, ticket } = ticketsWithOne();
      const other = tickets.createTicket({
        projectId: project.id,
        title: 'Fix the footer',
        externalReferences: ['#55'],
      });

      tickets.addExternalReferences(ticket.number, ['#55']);

      expect(tickets.getTicket(ticket.number).externalReferences).toEqual([
        '#55',
      ]);
      expect(tickets.getTicket(other.number).externalReferences).toEqual([
        '#55',
      ]);
    });

    it('removes references, ignoring ones the Ticket does not have', () => {
      const { tickets, ticket } = ticketsWithOne();
      tickets.addExternalReferences(ticket.number, ['#55', 'ABC-33', '#56']);

      const removed = tickets.removeExternalReferences(ticket.number, [
        ' #55 ',
        'abc-33',
      ]);

      expect(removed.externalReferences).toEqual(['ABC-33', '#56']);
    });

    it('refuses a reference that is neither a URL nor a key', () => {
      const { tickets, ticket } = ticketsWithOne();

      expect(
        errorFrom(() =>
          tickets.addExternalReferences(ticket.number, ['javascript:alert(1)']),
        ),
      ).toEqual(
        new ValidationError({
          externalReferences:
            '"javascript:alert(1)" is not a valid URL or key. Give an http(s) URL of at most 2,000 characters, or a key without spaces of at most 100 characters, such as #55 or ABC-33.',
        }),
      );
    });

    it('refuses an empty list', () => {
      const { tickets, ticket } = ticketsWithOne();

      expect(
        errorFrom(() => tickets.removeExternalReferences(ticket.number, [])),
      ).toEqual(
        new ValidationError({
          externalReferences: 'Enter a URL or key for each External reference.',
        }),
      );
    });

    it('refuses an unknown Ticket', () => {
      const tickets = createTestTickets();

      expect(
        errorFrom(() => tickets.addExternalReferences(99, ['#55'])),
      ).toEqual(new NotFoundError('There is no Ticket T99.'));
    });

    it('records an Activity entry for each reference added or removed', () => {
      const { tickets, ticket } = ticketsWithOne();
      tickets.addExternalReferences(ticket.number, ['#55', 'ABC-33']);
      tickets.addExternalReferences(ticket.number, ['#55']);
      tickets.removeExternalReferences(ticket.number, ['ABC-33', '#99']);

      expect(
        tickets.listActivity(ticket.number).map(({ changes }) => changes),
      ).toEqual([
        [{ type: 'created' }],
        [
          { type: 'externalReferenceAdded', reference: '#55' },
          { type: 'externalReferenceAdded', reference: 'ABC-33' },
        ],
        [{ type: 'externalReferenceRemoved', reference: 'ABC-33' }],
      ]);
    });
  });

  describe('at most 50 per Ticket', () => {
    const fifty = Array.from({ length: 50 }, (_, index) => `#${index + 1}`);

    it('creates a Ticket with 50, and refuses 51', () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });

      expect(
        tickets.createTicket({
          projectId: project.id,
          title: 'Fix the header',
          externalReferences: fifty,
        }).externalReferences,
      ).toHaveLength(50);
      expect(
        errorFrom(() =>
          tickets.createTicket({
            projectId: project.id,
            title: 'Fix the footer',
            externalReferences: [...fifty, '#51'],
          }),
        ),
      ).toEqual(
        new ValidationError({
          externalReferences:
            'A Ticket can have at most 50 External references.',
        }),
      );
    });

    it('refuses adding past 50, but not adding ones it already has', () => {
      const { tickets, ticket } = ticketsWithOne();
      tickets.addExternalReferences(ticket.number, fifty);

      expect(
        errorFrom(() => tickets.addExternalReferences(ticket.number, ['#51'])),
      ).toEqual(
        new ValidationError({
          externalReferences: `Ticket T${ticket.number} would have 51 External references; a Ticket can have at most 50. Remove some first.`,
        }),
      );
      expect(
        tickets.addExternalReferences(ticket.number, ['#1']).externalReferences,
      ).toHaveLength(50);
    });
  });

  describe('updating a Ticket', () => {
    it('removes, then adds, in one change with one Activity entry', () => {
      const { tickets, ticket } = ticketsWithOne();
      tickets.addExternalReferences(ticket.number, ['#55']);

      const updated = tickets.updateTicket(ticket.number, {
        title: 'Fix the big header',
        removeExternalReferences: ['#55'],
        addExternalReferences: ['ABC-33'],
      });

      expect(updated.externalReferences).toEqual(['ABC-33']);
      expect(tickets.listActivity(ticket.number).at(-1)?.changes).toEqual([
        { type: 'title', from: 'Fix the header', to: 'Fix the big header' },
        { type: 'externalReferenceRemoved', reference: '#55' },
        { type: 'externalReferenceAdded', reference: 'ABC-33' },
      ]);
    });

    it('refuses a reference named both to add and to remove', () => {
      const { tickets, ticket } = ticketsWithOne();

      expect(
        errorFrom(() =>
          tickets.updateTicket(ticket.number, {
            addExternalReferences: ['#55'],
            removeExternalReferences: ['#55'],
          }),
        ),
      ).toEqual(
        new ValidationError({
          externalReferences:
            'Name each External reference in addExternalReferences or removeExternalReferences, not both: #55.',
        }),
      );
    });

    it('refuses an invalid reference without changing anything', () => {
      const { tickets, ticket } = ticketsWithOne();

      expect(
        errorFrom(() =>
          tickets.updateTicket(ticket.number, {
            title: 'Fix the big header',
            addExternalReferences: ['ABC 33'],
          }),
        ),
      ).toEqual(
        new ValidationError({
          addExternalReferences:
            '"ABC 33" is not a valid URL or key. Give an http(s) URL of at most 2,000 characters, or a key without spaces of at most 100 characters, such as #55 or ABC-33.',
        }),
      );
      expect(tickets.getTicket(ticket.number).title).toBe('Fix the header');
    });
  });

  it('creates Tickets in a batch with their references', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const [first, second] = tickets.createTicketBatch({
      projectId: project.id,
      tickets: [
        { title: 'Fix the header', externalReferences: ['#55'] },
        { title: 'Fix the footer' },
      ],
    });

    expect(first.externalReferences).toEqual(['#55']);
    expect(second.externalReferences).toEqual([]);
  });

  it('deletes a Ticket with its references', () => {
    const { tickets, ticket } = ticketsWithOne();
    tickets.addExternalReferences(ticket.number, ['#55']);

    tickets.deleteTicket(ticket.number);

    expect(errorFrom(() => tickets.getTicket(ticket.number))).toEqual(
      new NotFoundError(`There is no Ticket T${ticket.number}.`),
    );
  });
});
