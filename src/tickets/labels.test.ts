// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
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

describe('Labelling Tickets', () => {
  it('gives a new Ticket no labels', () => {
    const { ticket } = ticketsWithOne();

    expect(ticket.labels).toEqual([]);
  });

  it('creates a Ticket with labels', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
      labels: ['needs-triage', 'bug'],
    });

    expect(ticket.labels).toEqual(['bug', 'needs-triage']);
    expect(tickets.getTicket(ticket.number).labels).toEqual([
      'bug',
      'needs-triage',
    ]);
  });

  it('adds labels, sorted, trimmed and lower-cased, once each', () => {
    const { tickets, ticket } = ticketsWithOne();

    tickets.addLabels(ticket.number, ['  Bug ', 'needs-triage']);
    const labelled = tickets.addLabels(ticket.number, ['bug', 'BUG', 'api']);

    expect(labelled.labels).toEqual(['api', 'bug', 'needs-triage']);
    expect(tickets.getTicket(ticket.number).labels).toEqual([
      'api',
      'bug',
      'needs-triage',
    ]);
  });

  it('removes labels, ignoring case and labels the Ticket does not have', () => {
    const { tickets, ticket } = ticketsWithOne();
    tickets.addLabels(ticket.number, ['bug', 'needs-triage']);

    const unlabelled = tickets.removeLabels(ticket.number, [
      'Needs-Triage',
      'wontfix',
    ]);

    expect(unlabelled.labels).toEqual(['bug']);
    expect(tickets.getTicket(ticket.number).labels).toEqual(['bug']);
  });

  it('bumps the updated time when labels change', () => {
    vi.useFakeTimers({ now: new Date('2026-03-01T09:00:00Z') });
    try {
      const { tickets, ticket } = ticketsWithOne();
      vi.setSystemTime(new Date('2026-03-01T10:00:00Z'));

      const labelled = tickets.addLabels(ticket.number, ['bug']);

      expect(labelled.updatedAt).toEqual(new Date('2026-03-01T10:00:00Z'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps labels when the Ticket moves, is updated or archived', () => {
    const { tickets, ticket } = ticketsWithOne();
    const app = tickets.createProject({ name: 'App' });
    tickets.addLabels(ticket.number, ['bug']);

    expect(
      tickets.updateTicket(ticket.number, { projectId: app.id, status: 'Done' })
        .labels,
    ).toEqual(['bug']);
    expect(tickets.archiveTicket(ticket.number).labels).toEqual(['bug']);
    expect(tickets.restoreTicket(ticket.number).labels).toEqual(['bug']);
  });

  it.each([
    ['an empty label', '  ', 'Enter a label.'],
    ['a two-line label', 'needs\ntriage', 'Keep each label to one line.'],
    [
      'a 51-character label',
      'x'.repeat(51),
      'Keep each label to 50 characters or fewer.',
    ],
  ])('refuses %s and adds none', (_case, label, reason) => {
    const { tickets, ticket } = ticketsWithOne();

    expect(
      errorFrom(() => tickets.addLabels(ticket.number, ['bug', label])),
    ).toEqual(new ValidationError({ labels: reason }));
    expect(tickets.getTicket(ticket.number).labels).toEqual([]);
  });

  it('refuses a bad label when creating a Ticket', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });

    expect(
      errorFrom(() =>
        tickets.createTicket({
          projectId: project.id,
          title: 'Fix the header',
          labels: [''],
        }),
      ),
    ).toEqual(new ValidationError({ labels: 'Enter a label.' }));
    expect(tickets.listTickets()).toEqual([]);
  });

  it('says when the Ticket does not exist', () => {
    const tickets = createTestTickets();

    expect(errorFrom(() => tickets.addLabels(42, ['bug']))).toEqual(
      new NotFoundError('There is no Ticket #42.'),
    );
    expect(errorFrom(() => tickets.removeLabels(42, ['bug']))).toEqual(
      new NotFoundError('There is no Ticket #42.'),
    );
  });

  it('announces a label change and nothing for a refused one', () => {
    const changes = createChangeChannel();
    const tickets = createTestTickets(changes);
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    const listener = vi.fn();
    changes.subscribe(listener);

    tickets.addLabels(ticket.number, ['bug']);
    tickets.removeLabels(ticket.number, ['bug']);
    errorFrom(() => tickets.addLabels(ticket.number, ['']));

    expect(listener.mock.calls).toEqual([
      [{ type: 'ticket', number: ticket.number }],
      [{ type: 'ticket', number: ticket.number }],
    ]);
  });
});

describe('Listing labels', () => {
  it('lists every label in use once, sorted, including on archived Tickets', () => {
    const { tickets, project, ticket } = ticketsWithOne();
    const other = tickets.createTicket({ projectId: project.id, title: 'B' });
    tickets.addLabels(ticket.number, ['needs-triage', 'bug']);
    tickets.addLabels(other.number, ['bug', 'enhancement']);
    tickets.archiveTicket(other.number);

    expect(tickets.listLabels()).toEqual([
      'bug',
      'enhancement',
      'needs-triage',
    ]);
  });

  it('forgets a label once no Ticket has it', () => {
    const { tickets, ticket } = ticketsWithOne();
    tickets.addLabels(ticket.number, ['bug']);
    tickets.removeLabels(ticket.number, ['bug']);

    expect(tickets.listLabels()).toEqual([]);
  });
});

describe('Filtering Tickets by label', () => {
  it('lists only Tickets that have every given label, with their labels', () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const both = tickets.createTicket({
      projectId: project.id,
      title: 'Both',
      labels: ['bug', 'ready-for-agent'],
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Only bug',
      labels: ['bug'],
    });
    tickets.createTicket({ projectId: project.id, title: 'None' });

    expect(
      tickets.listTickets({ labels: [' Ready-For-Agent', 'bug'] }),
    ).toEqual([both]);
    expect(
      tickets.listTickets({ labels: ['bug'] }).map(({ title }) => title),
    ).toEqual(['Both', 'Only bug']);
  });

  it('combines the label filter with Project, Status and archived', () => {
    const tickets = createTestTickets();
    const website = tickets.createProject({ name: 'Website' });
    const app = tickets.createProject({ name: 'App' });
    tickets.createTicket({
      projectId: website.id,
      title: 'Match',
      labels: ['bug'],
    });
    tickets.createTicket({
      projectId: app.id,
      title: 'Other Project',
      labels: ['bug'],
    });
    const archived = tickets.createTicket({
      projectId: website.id,
      title: 'Archived',
      labels: ['bug'],
    });
    tickets.archiveTicket(archived.number);

    expect(
      tickets
        .listTickets({ projectId: website.id, labels: ['bug'] })
        .map(({ title }) => title),
    ).toEqual(['Match']);
    expect(
      tickets
        .listTickets({
          projectId: website.id,
          labels: ['bug'],
          includeArchived: true,
        })
        .map(({ title }) => title),
    ).toEqual(['Match', 'Archived']);
  });

  it('lists every Ticket for an empty label filter', () => {
    const { tickets } = ticketsWithOne();

    expect(tickets.listTickets({ labels: [] })).toHaveLength(1);
  });
});

describe('Changing labels in a Ticket update', () => {
  it('swaps a triage state label and changes the Status in one update', () => {
    const { tickets, ticket } = ticketsWithOne();
    tickets.addLabels(ticket.number, ['bug', 'needs-triage']);

    const updated = tickets.updateTicket(ticket.number, {
      status: 'In progress',
      removeLabels: ['Needs-Triage'],
      addLabels: [' Ready-For-Agent '],
    });

    expect(updated.status).toBe('In progress');
    expect(updated.labels).toEqual(['bug', 'ready-for-agent']);
    expect(tickets.getTicket(ticket.number)).toEqual(updated);
  });

  it('refuses a label named in both addLabels and removeLabels', () => {
    const { tickets, ticket } = ticketsWithOne();

    expect(
      errorFrom(() =>
        tickets.updateTicket(ticket.number, {
          addLabels: ['bug'],
          removeLabels: [' BUG'],
        }),
      ),
    ).toEqual(
      new ValidationError({
        labels: 'Name each label in addLabels or removeLabels, not both: bug.',
      }),
    );
  });

  it('changes nothing when a label or another field is refused', () => {
    const { tickets, ticket } = ticketsWithOne();
    tickets.addLabels(ticket.number, ['needs-triage']);
    const before = tickets.getTicket(ticket.number);

    expect(
      errorFrom(() =>
        tickets.updateTicket(ticket.number, {
          title: '',
          removeLabels: ['needs-triage'],
          addLabels: ['x'.repeat(51)],
        }),
      ),
    ).toEqual(
      new ValidationError({
        title: 'Enter a title.',
        addLabels: 'Keep each label to 50 characters or fewer.',
      }),
    );
    expect(tickets.getTicket(ticket.number)).toEqual(before);
  });

  it('announces the update once', () => {
    const changes = createChangeChannel();
    const tickets = createTestTickets(changes);
    const project = tickets.createProject({ name: 'Website' });
    const ticket = tickets.createTicket({ projectId: project.id, title: 'A' });
    const listener = vi.fn();
    changes.subscribe(listener);

    tickets.updateTicket(ticket.number, {
      status: 'Done',
      addLabels: ['bug'],
    });

    expect(listener.mock.calls).toEqual([
      [{ type: 'ticket', number: ticket.number }],
    ]);
  });
});
