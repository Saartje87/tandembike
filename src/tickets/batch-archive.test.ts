// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import type { Change } from './changes';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';

function setUp() {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const [a, b, c] = ['A', 'B', 'C'].map((title) =>
    tickets.createTicket({ projectId: project.id, title }),
  );
  const changes: Change[] = [];
  tickets.subscribe((change) => changes.push(change));
  return { tickets, project, a, b, c, changes };
}

describe('Archiving several Tickets at once', () => {
  it('archives every Ticket given and announces them once', () => {
    const { tickets, a, b, c, changes } = setUp();

    tickets.archiveTickets([c.number, a.number]);

    expect(tickets.getTicket(a.number).archived).toBe(true);
    expect(tickets.getTicket(b.number).archived).toBe(false);
    expect(tickets.getTicket(c.number).archived).toBe(true);
    expect(changes).toEqual([
      { type: 'tickets', numbers: [c.number, a.number] },
    ]);
  });

  it("derives a child's Epic Status again and announces the Epic with them", () => {
    const { tickets, project, a, changes } = setUp();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const done = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
      status: 'Done',
    });
    const todo = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by bank',
      epicNumber: epic.number,
    });
    changes.length = 0;

    tickets.archiveTickets([todo.number, a.number]);

    expect(tickets.getTicket(done.number).archived).toBe(false);
    expect(tickets.getTicket(epic.number).status).toBe('Done');
    expect(changes).toEqual([
      { type: 'tickets', numbers: [todo.number, a.number, epic.number] },
    ]);
  });

  it('archives none of the Tickets when one cannot be archived, and names it', () => {
    const { tickets, project, a, changes } = setUp();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
    });
    changes.length = 0;

    expect(
      errorFrom(() => tickets.archiveTickets([a.number, epic.number])),
    ).toEqual(
      new NotAllowedError(
        `Epic T${epic.number} has child Tickets that are not archived: T${child.number}. Archive or detach them first.`,
      ),
    );
    expect(tickets.getTicket(a.number).archived).toBe(false);
    expect(tickets.getTicket(epic.number).archived).toBe(false);
    expect(changes).toEqual([]);
  });

  it('archives none of the Tickets when one does not exist', () => {
    const { tickets, a, changes } = setUp();

    expect(errorFrom(() => tickets.archiveTickets([a.number, 42]))).toEqual(
      new NotFoundError('There is no Ticket T42.'),
    );
    expect(tickets.getTicket(a.number).archived).toBe(false);
    expect(changes).toEqual([]);
  });

  it('refuses an empty or repeated list', () => {
    const { tickets, a } = setUp();

    expect(errorFrom(() => tickets.archiveTickets([]))).toEqual(
      new ValidationError({ ticketNumbers: 'Choose at least one Ticket.' }),
    );
    expect(
      errorFrom(() => tickets.archiveTickets([a.number, a.number])),
    ).toEqual(
      new ValidationError({
        ticketNumbers: `Choose each Ticket once: T${a.number} is given twice.`,
      }),
    );
  });
});
