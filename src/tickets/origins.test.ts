// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import type { Change } from './changes';
import { NotFoundError, ValidationError } from './errors';

const setUp = () => {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const spec = tickets.createTicket({
    projectId: project.id,
    title: 'Checkout spec',
  });
  return { tickets, project, spec };
};

describe('Creating a Ticket split from an Origin', () => {
  it('links the Ticket to its Origin and lists it as split off the Origin', () => {
    const { tickets, project, spec } = setUp();

    const split = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      originNumber: spec.number,
    });

    expect(split.origin).toEqual({
      number: spec.number,
      title: 'Checkout spec',
      status: 'Todo',
    });
    expect(split.splitOff).toEqual([]);
    expect(tickets.getTicket(spec.number)).toMatchObject({
      origin: null,
      splitOff: [
        {
          number: split.number,
          title: 'Pay by card',
          status: 'Todo',
          archived: false,
        },
      ],
    });
  });

  it('takes an Origin in another Project', () => {
    const { tickets, spec } = setUp();
    const app = tickets.createProject({ name: 'App' });

    const split = tickets.createTicket({
      projectId: app.id,
      title: 'Pay by card',
      originNumber: spec.number,
    });

    expect(split.origin?.number).toBe(spec.number);
  });

  it('refuses an Origin that does not exist, creating nothing', () => {
    const { tickets, project } = setUp();

    expect(
      errorFrom(() =>
        tickets.createTicket({
          projectId: project.id,
          title: 'Pay by card',
          originNumber: 99,
        }),
      ),
    ).toEqual(new NotFoundError('There is no Ticket #99 to be the Origin.'));
    expect(tickets.listTickets().map(({ number }) => number)).toEqual([1]);
  });
});

describe('Creating a batch split from an Origin', () => {
  it('gives every Ticket of the batch the Origin', () => {
    const { tickets, project, spec } = setUp();

    const created = tickets.createTicketBatch({
      projectId: project.id,
      originNumber: spec.number,
      tickets: [{ title: 'Pay by card' }, { title: 'Pay by invoice' }],
    });

    expect(created.map((ticket) => ticket.origin?.number)).toEqual([
      spec.number,
      spec.number,
    ]);
    expect(
      tickets.getTicket(spec.number).splitOff.map(({ title }) => title),
    ).toEqual(['Pay by card', 'Pay by invoice']);
  });

  it('refuses an Origin that does not exist, creating none of them', () => {
    const { tickets, project } = setUp();

    expect(
      errorFrom(() =>
        tickets.createTicketBatch({
          projectId: project.id,
          originNumber: 99,
          tickets: [{ title: 'Pay by card' }, { title: 'Pay by invoice' }],
        }),
      ),
    ).toEqual(new NotFoundError('There is no Ticket #99 to be the Origin.'));
    expect(tickets.listTickets().map(({ number }) => number)).toEqual([1]);
  });
});

describe('Announcing Origin changes', () => {
  it('announces the Origin with a Ticket created from it', () => {
    const { tickets, project, spec } = setUp();
    const announced: Change[] = [];
    tickets.subscribe((change) => announced.push(change));

    const split = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      originNumber: spec.number,
    });

    expect(announced).toEqual([
      { type: 'tickets', numbers: [split.number, spec.number] },
    ]);
  });

  it('announces the Origin with a batch created from it', () => {
    const { tickets, project, spec } = setUp();
    const announced: Change[] = [];
    tickets.subscribe((change) => announced.push(change));

    const created = tickets.createTicketBatch({
      projectId: project.id,
      originNumber: spec.number,
      tickets: [{ title: 'Pay by card' }, { title: 'Pay by invoice' }],
    });

    expect(announced).toEqual([
      {
        type: 'tickets',
        numbers: [...created.map(({ number }) => number), spec.number],
      },
    ]);
  });
});

describe("Changing a Ticket's Origin", () => {
  const twoSpecs = () => {
    const { tickets, project, spec } = setUp();
    const other = tickets.createTicket({
      projectId: project.id,
      title: 'Invoice spec',
    });
    const split = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      originNumber: spec.number,
    });
    return { tickets, project, spec, other, split };
  };

  it('moves the Ticket to another Origin', () => {
    const { tickets, spec, other, split } = twoSpecs();

    const moved = tickets.updateTicket(split.number, {
      originNumber: other.number,
    });

    expect(moved.origin?.number).toBe(other.number);
    expect(tickets.getTicket(spec.number).splitOff).toEqual([]);
    expect(
      tickets.getTicket(other.number).splitOff.map(({ number }) => number),
    ).toEqual([split.number]);
  });

  it('clears the Origin with null', () => {
    const { tickets, spec, split } = twoSpecs();

    const cleared = tickets.updateTicket(split.number, { originNumber: null });

    expect(cleared.origin).toBeNull();
    expect(tickets.getTicket(spec.number).splitOff).toEqual([]);
  });

  it('keeps the Origin when the update leaves it out', () => {
    const { tickets, spec, split } = twoSpecs();

    const updated = tickets.updateTicket(split.number, { title: 'Pay' });

    expect(updated.origin?.number).toBe(spec.number);
  });

  it('announces the old and the new Origin', () => {
    const { tickets, spec, other, split } = twoSpecs();
    const announced: Change[] = [];
    tickets.subscribe((change) => announced.push(change));

    tickets.updateTicket(split.number, { originNumber: other.number });

    expect(announced).toEqual([
      { type: 'tickets', numbers: [split.number, spec.number, other.number] },
    ]);
  });

  it('refuses to make a Ticket its own Origin', () => {
    const { tickets, split } = twoSpecs();

    expect(
      errorFrom(() =>
        tickets.updateTicket(split.number, { originNumber: split.number }),
      ),
    ).toEqual(
      new ValidationError({
        originNumber: 'A Ticket cannot be its own Origin.',
      }),
    );
  });

  it('refuses an Origin chain that would loop, leaving the Ticket as it was', () => {
    const { tickets, project, spec, split } = twoSpecs();
    const subtask = tickets.createTicket({
      projectId: project.id,
      title: 'Card form',
      originNumber: split.number,
    });

    expect(
      errorFrom(() =>
        tickets.updateTicket(spec.number, {
          title: 'Renamed',
          originNumber: subtask.number,
        }),
      ),
    ).toEqual(
      new ValidationError({
        originNumber: `#${subtask.number} cannot be the Origin of #${spec.number}, because #${spec.number} is already an Origin of #${subtask.number}: #${spec.number} → #${split.number} → #${subtask.number}.`,
      }),
    );
    expect(tickets.getTicket(spec.number)).toMatchObject({
      title: 'Checkout spec',
      origin: null,
    });
  });

  it('refuses an Origin that does not exist', () => {
    const { tickets, split } = twoSpecs();

    expect(
      errorFrom(() => tickets.updateTicket(split.number, { originNumber: 99 })),
    ).toEqual(new NotFoundError('There is no Ticket #99 to be the Origin.'));
  });
});

describe('An Origin over the lifecycle', () => {
  const split = () => {
    const { tickets, project, spec } = setUp();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      originNumber: spec.number,
    });
    return { tickets, project, spec, split: ticket };
  };

  it('keeps the link when the Origin is Done or archived', () => {
    const { tickets, spec, split: ticket } = split();

    tickets.updateTicket(spec.number, { status: 'Done' });
    tickets.archiveTicket(spec.number);

    expect(tickets.getTicket(ticket.number).origin).toEqual({
      number: spec.number,
      title: 'Checkout spec',
      status: 'Done',
    });
  });

  it('keeps the link when the split-off Ticket is archived, and lists it as archived', () => {
    const { tickets, spec, split: ticket } = split();

    tickets.archiveTicket(ticket.number);

    expect(tickets.getTicket(ticket.number).origin?.number).toBe(spec.number);
    expect(tickets.getTicket(spec.number).splitOff).toEqual([
      {
        number: ticket.number,
        title: 'Pay by card',
        status: 'Todo',
        archived: true,
      },
    ]);
  });

  it('clears the Origin of its split-off Tickets, keeping them, when the Origin is deleted', () => {
    const { tickets, spec, split: ticket } = split();
    const announced: Change[] = [];
    tickets.subscribe((change) => announced.push(change));

    tickets.deleteTicket(spec.number);

    expect(tickets.getTicket(ticket.number).origin).toBeNull();
    expect(announced).toEqual([
      { type: 'tickets', numbers: [spec.number, ticket.number] },
    ]);
  });

  it("clears the Origin of a deleted Epic's child's split-off Tickets", () => {
    const { tickets, project } = setUp();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Card spec',
      epicNumber: epic.number,
    });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Card form',
      originNumber: child.number,
    });

    tickets.deleteTicket(epic.number, { withChildren: true });

    expect(tickets.getTicket(ticket.number).origin).toBeNull();
  });
});

describe('Finding the Tickets split from an Origin', () => {
  it('lists only the Tickets split from it, combined with the other filters', () => {
    const { tickets, project, spec } = setUp();
    const [card, invoice, done] = tickets.createTicketBatch({
      projectId: project.id,
      originNumber: spec.number,
      tickets: [
        { title: 'Pay by card' },
        { title: 'Pay by invoice', blockedByPositions: [0] },
        { title: 'Pay by cash', status: 'Done' },
      ],
    });
    tickets.createTicket({ projectId: project.id, title: 'Unrelated' });

    const all = tickets.findTickets({ originNumber: spec.number });
    const ready = tickets.findTickets({
      originNumber: spec.number,
      status: 'Todo',
      blocked: false,
      claimed: false,
    });

    expect(all.tickets.map(({ number }) => number)).toEqual([
      card.number,
      invoice.number,
      done.number,
    ]);
    expect(ready.tickets.map(({ number }) => number)).toEqual([card.number]);
    expect(ready.total).toBe(1);
  });
});

describe("Bumping an Origin's updated time", () => {
  const at = (hour: number) =>
    new Date(`2026-03-01T${String(hour).padStart(2, '0')}:00:00Z`);

  it('bumps the Origin whenever its split-off Tickets change', () => {
    vi.useFakeTimers({ now: at(9) });
    try {
      const { tickets, project, spec } = setUp();
      const other = tickets.createTicket({
        projectId: project.id,
        title: 'Invoice spec',
      });
      vi.setSystemTime(at(10));
      const split = tickets.createTicket({
        projectId: project.id,
        title: 'Pay by card',
        originNumber: spec.number,
      });
      expect(tickets.getTicket(spec.number).updatedAt).toEqual(at(10));

      vi.setSystemTime(at(11));
      tickets.updateTicket(split.number, { originNumber: other.number });
      expect(tickets.getTicket(spec.number).updatedAt).toEqual(at(11));
      expect(tickets.getTicket(other.number).updatedAt).toEqual(at(11));

      vi.setSystemTime(at(12));
      tickets.createTicketBatch({
        projectId: project.id,
        originNumber: spec.number,
        tickets: [{ title: 'Refund' }],
      });
      expect(tickets.getTicket(spec.number).updatedAt).toEqual(at(12));

      vi.setSystemTime(at(13));
      tickets.deleteTicket(split.number);
      expect(tickets.getTicket(other.number).updatedAt).toEqual(at(13));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('What an Origin leaves alone', () => {
  it('lets an Epic have an Origin and be one', () => {
    const { tickets, project, spec } = setUp();

    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
      originNumber: spec.number,
    });
    const split = tickets.createTicket({
      projectId: project.id,
      title: 'Card form',
      originNumber: epic.number,
    });

    expect(tickets.getTicket(epic.number)).toMatchObject({
      origin: { number: spec.number },
      splitOff: [{ number: split.number }],
      status: 'Todo',
      children: [],
    });
  });

  it("keeps a split-off Ticket's Status and Claim to itself", () => {
    const { tickets, project, spec } = setUp();
    const split = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      originNumber: spec.number,
    });

    tickets.claimTicket(spec.number, { agentRunId: 'run-1' });
    tickets.updateTicket(spec.number, { status: 'Done' });
    tickets.claimTicket(split.number, { agentRunId: 'run-2' });

    expect(tickets.getTicket(split.number)).toMatchObject({
      status: 'Todo',
      claim: { agentRunId: 'run-2' },
      blocked: false,
    });
  });

  it('announces the Origin of a deleted split-off Ticket', () => {
    const { tickets, project, spec } = setUp();
    const split = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      originNumber: spec.number,
    });
    const announced: Change[] = [];
    tickets.subscribe((change) => announced.push(change));

    tickets.deleteTicket(split.number);

    expect(announced).toEqual([
      { type: 'tickets', numbers: [split.number, spec.number] },
    ]);
    expect(tickets.getTicket(spec.number).splitOff).toEqual([]);
  });
});
