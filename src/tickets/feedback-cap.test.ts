import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom as rawErrorFrom } from '../test/tickets';
import { jaccardSimilarity } from './feedback';

const errorFrom = (fn: () => unknown) => rawErrorFrom(fn) as Error;

const setUp = () => {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  return { tickets, project };
};

const feedback = (title: string, label = 'from:agent-run') => ({
  title,
  labels: ['needs-triage', label],
});

describe('Jaccard similarity of titles', () => {
  it('ignores case, punctuation and stop words', () => {
    expect(jaccardSimilarity('The Sidebar, is broken!', 'sidebar broken')).toBe(
      1,
    );
  });

  it('is the shared words over all words', () => {
    expect(jaccardSimilarity('x y z w', 'x y z v')).toBeCloseTo(0.6);
  });
});

describe('Filed-by run', () => {
  it('is set from the run that filed the batch', () => {
    const { tickets, project } = setUp();
    const [created] = tickets.createTicketBatch({
      projectId: project.id,
      filedByRun: 'run-1',
      tickets: [{ title: 'One' }],
    });
    expect(tickets.getTicket(created.number).filedByRun).toBe('run-1');
  });

  it('is null without a run', () => {
    const { tickets, project } = setUp();
    const [created] = tickets.createTicketBatch({
      projectId: project.id,
      tickets: [{ title: 'One' }],
    });
    expect(tickets.getTicket(created.number).filedByRun).toBeNull();
  });
});

describe('The feedback cap', () => {
  const file = (
    tickets: ReturnType<typeof setUp>['tickets'],
    projectId: number,
    run: string | undefined,
    titles: string[],
    label?: string,
  ) =>
    tickets.createTicketBatch({
      projectId,
      filedByRun: run,
      tickets: titles.map((title) => feedback(title, label)),
    });

  it('refuses the fourth feedback Ticket of a run, naming add_note', () => {
    const { tickets, project } = setUp();
    file(tickets, project.id, 'run-1', [
      'Alpha one',
      'Beta two',
      'Gamma three',
    ]);

    const error = errorFrom(() =>
      file(tickets, project.id, 'run-1', ['Delta four']),
    );

    expect(error.message).toBe(
      'This run has filed 3 feedback Tickets already; add a note to one of them with add_note instead.',
    );
  });

  it('refuses a batch that would exceed the cap whole', () => {
    const { tickets, project } = setUp();
    file(tickets, project.id, 'run-1', ['Alpha one', 'Beta two']);

    expect(
      errorFrom(() =>
        file(tickets, project.id, 'run-1', ['Gamma three', 'Delta four']),
      ).message,
    ).toContain('add a note');
    expect(tickets.findTickets({ projectId: project.id }).tickets).toHaveLength(
      2,
    );
  });

  it('counts per run', () => {
    const { tickets, project } = setUp();
    file(tickets, project.id, 'run-1', [
      'Alpha one',
      'Beta two',
      'Gamma three',
    ]);

    expect(() =>
      file(tickets, project.id, 'run-2', ['Delta four']),
    ).not.toThrow();
  });

  it('counts from:tandembike Tickets too', () => {
    const { tickets, project } = setUp();
    file(
      tickets,
      project.id,
      'run-1',
      ['Alpha one', 'Beta two'],
      'from:tandembike',
    );
    file(tickets, project.id, 'run-1', ['Gamma three']);

    expect(() => file(tickets, project.id, 'run-1', ['Delta four'])).toThrow();
  });

  it('does not count Tickets without a source label', () => {
    const { tickets, project } = setUp();
    tickets.createTicketBatch({
      projectId: project.id,
      filedByRun: 'run-1',
      tickets: [
        { title: 'S1' },
        { title: 'S2' },
        { title: 'S3' },
        { title: 'S4' },
      ],
    });

    expect(() =>
      file(tickets, project.id, 'run-1', [
        'Alpha one',
        'Beta two',
        'Gamma three',
      ]),
    ).not.toThrow();
  });

  it('caps nothing without a run', () => {
    const { tickets, project } = setUp();
    expect(() =>
      file(tickets, project.id, undefined, [
        'Alpha one',
        'Beta two',
        'Gamma three',
        'Delta four',
        'Epsilon five',
      ]),
    ).not.toThrow();
  });
});

describe('Feedback dedupe', () => {
  const file = (
    tickets: ReturnType<typeof setUp>['tickets'],
    projectId: number,
    titles: string[],
  ) =>
    tickets.createTicketBatch({
      projectId,
      tickets: titles.map((title) => feedback(title)),
    });

  it('refuses a near-duplicate, naming its position and the match', () => {
    const { tickets, project } = setUp();
    const [first] = file(tickets, project.id, [
      'Sidebar closes when I resize the window',
    ]);

    const error = errorFrom(() =>
      file(tickets, project.id, [
        'Something else entirely',
        'Sidebar closes when I resize the window!',
      ]),
    );

    expect(error.message).toContain('position 1');
    expect(error.message).toContain(`T${first.number}`);
  });

  it('refuses a near-duplicate between two feedback Tickets of one batch, naming both positions', () => {
    const { tickets, project } = setUp();

    const error = errorFrom(() =>
      file(tickets, project.id, [
        'Sidebar closes when I resize the window',
        'Something else entirely',
        'Sidebar closes when I resize the window!',
      ]),
    );

    expect(error.message).toContain('position 2');
    expect(error.message).toContain('position 0');
  });

  it('refuses at exactly 0.75', () => {
    const { tickets, project } = setUp();
    file(tickets, project.id, ['alpha beta gamma delta']);
    // 3 shared of 4 total: 0.75.
    expect(() => file(tickets, project.id, ['alpha beta gamma'])).toThrow();
  });

  it('accepts just under 0.75', () => {
    const { tickets, project } = setUp();
    file(tickets, project.id, ['alpha beta gamma delta epsilon']);
    // 3 shared of 5 total... 0.6
    expect(() => file(tickets, project.id, ['alpha beta gamma'])).not.toThrow();
  });

  it('does not refuse a match that is Done or archived', () => {
    const { tickets, project } = setUp();
    const [done, archived] = file(tickets, project.id, [
      'Sidebar closes on resize',
      'Header flickers on scroll',
    ]);
    tickets.updateTicket(done.number, { status: 'Done' });
    tickets.archiveTicket(archived.number);

    expect(() =>
      file(tickets, project.id, [
        'Sidebar closes on resize',
        'Header flickers on scroll',
      ]),
    ).not.toThrow();
  });

  it('never compares Tickets without a source label', () => {
    const { tickets, project } = setUp();
    tickets.createTicket({
      projectId: project.id,
      title: 'Sidebar closes on resize',
    });

    expect(() =>
      file(tickets, project.id, ['Sidebar closes on resize']),
    ).not.toThrow();
    expect(() =>
      tickets.createTicketBatch({
        projectId: project.id,
        tickets: [{ title: 'Sidebar closes on resize' }],
      }),
    ).not.toThrow();
  });

  it('only compares within the Project', () => {
    const { tickets, project } = setUp();
    const other = tickets.createProject({ name: 'Other' });
    file(tickets, project.id, ['Sidebar closes on resize']);

    expect(() =>
      file(tickets, other.id, ['Sidebar closes on resize']),
    ).not.toThrow();
  });
});
