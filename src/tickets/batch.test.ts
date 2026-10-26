// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { createChangeChannel } from './changes';
import { ValidationError } from './errors';

function ticketsWithThree() {
  const changes = createChangeChannel();
  const tickets = createTestTickets(changes);
  const project = tickets.createProject({ name: 'Website' });
  const [a, b, c] = ['A', 'B', 'C'].map((title) =>
    tickets.createTicket({
      projectId: project.id,
      title,
      labels: ['needs-triage'],
    }),
  );
  return { tickets, changes, a, b, c };
}

describe('Updating several Tickets at once', () => {
  it('applies the same Status and label change to every Ticket given', () => {
    const { tickets, a, b, c } = ticketsWithThree();

    const result = tickets.updateTickets({
      ticketNumbers: [c.number, a.number],
      status: 'Done',
      removeLabels: ['needs-triage'],
      addLabels: ['ready-for-agent'],
    });

    expect(result.failed).toEqual([]);
    expect(result.updated.map(({ number }) => number)).toEqual([
      c.number,
      a.number,
    ]);
    for (const number of [a.number, c.number]) {
      expect(tickets.getTicket(number)).toMatchObject({
        status: 'Done',
        labels: ['ready-for-agent'],
      });
    }
    expect(tickets.getTicket(b.number)).toEqual(b);
  });

  it('reports each Ticket that could not be changed and still changes the rest', () => {
    const { tickets, a } = ticketsWithThree();

    const result = tickets.updateTickets({
      ticketNumbers: [42, a.number],
      status: 'In progress',
    });

    expect(result.updated).toEqual([tickets.getTicket(a.number)]);
    expect(result.updated[0].status).toBe('In progress');
    expect(result.failed).toEqual([
      { number: 42, error: 'There is no Ticket T42.' },
    ]);
  });

  it.each([
    [
      'no Ticket numbers',
      { ticketNumbers: [], status: 'Done' as const },
      { ticketNumbers: 'Choose at least one Ticket.' },
    ],
    [
      'more than 50 Ticket numbers',
      {
        ticketNumbers: Array.from({ length: 51 }, (_, index) => index + 1),
        status: 'Done' as const,
      },
      { ticketNumbers: 'Choose at most 50 Tickets at a time.' },
    ],
    [
      'a Ticket number given twice',
      { ticketNumbers: [1, 2, 1], status: 'Done' as const },
      { ticketNumbers: 'Choose each Ticket once: T1 is given twice.' },
    ],
    [
      'no change',
      { ticketNumbers: [1] },
      { change: 'Give a Status, color, addLabels or removeLabels to change.' },
    ],
    [
      'a bad label',
      { ticketNumbers: [1], addLabels: [''] },
      { addLabels: 'Enter a label.' },
    ],
  ])('refuses %s and changes nothing', (_case, input, fieldErrors) => {
    const { tickets, a } = ticketsWithThree();

    expect(errorFrom(() => tickets.updateTickets(input))).toEqual(
      new ValidationError(fieldErrors),
    );
    expect(tickets.getTicket(a.number)).toEqual(a);
  });

  it('announces the changed Tickets once for the whole batch', () => {
    const { tickets, changes, a, b } = ticketsWithThree();
    const listener = vi.fn();
    changes.subscribe(listener);

    tickets.updateTickets({
      ticketNumbers: [a.number, 42, b.number],
      addLabels: ['bug'],
    });
    tickets.updateTickets({ ticketNumbers: [42], addLabels: ['bug'] });

    expect(listener.mock.calls).toEqual([
      [{ type: 'tickets', numbers: [a.number, b.number] }],
    ]);
  });
});
