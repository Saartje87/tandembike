import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import type { Change } from './changes';
import { NotFoundError, ValidationError } from './errors';

const setUp = () => {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  return { tickets, project };
};

type Batch = Parameters<
  ReturnType<typeof setUp>['tickets']['createTicketBatch']
>[0]['tickets'];

const refusal = (batch: Batch) => {
  const { tickets, project } = setUp();
  const error = errorFrom(() =>
    tickets.createTicketBatch({ projectId: project.id, tickets: batch }),
  );
  expect(tickets.listTickets()).toHaveLength(0);
  return error;
};

describe('Creating an Epic or an Origin in a batch', () => {
  it('creates an Epic with a colour, or the default one, and its children', () => {
    const { tickets, project } = setUp();

    const [red, plain, child, other] = tickets.createTicketBatch({
      projectId: project.id,
      tickets: [
        { title: 'Red', type: 'Epic', color: 'red' },
        { title: 'Plain', type: 'Epic' },
        { title: 'Child', epicPosition: 0 },
        { title: 'Other', epicPosition: 0, status: 'Done' },
      ],
    });

    expect(tickets.getTicket(red.number)).toMatchObject({
      type: 'Epic',
      color: 'red',
      status: 'In progress',
    });
    expect(tickets.getTicket(plain.number)).toMatchObject({
      type: 'Epic',
      status: 'Todo',
    });
    expect(tickets.getTicket(plain.number).color).not.toBe('red');
    expect(tickets.getTicket(child.number).epic?.number).toBe(red.number);
    expect(tickets.getTicket(other.number).epic?.number).toBe(red.number);
  });

  it('makes an earlier Ticket the Origin', () => {
    const { tickets, project } = setUp();

    const [spec, build] = tickets.createTicketBatch({
      projectId: project.id,
      tickets: [{ title: 'Spec' }, { title: 'Build', originPosition: 0 }],
    });

    expect(tickets.getTicket(build.number).origin?.number).toBe(spec.number);
    expect(
      tickets.getTicket(spec.number).splitOff.map(({ number }) => number),
    ).toEqual([build.number]);
  });

  it('announces every Ticket once', () => {
    const { tickets, project } = setUp();
    const announced: Change[] = [];
    tickets.subscribe((change) => announced.push(change));

    const created = tickets.createTicketBatch({
      projectId: project.id,
      tickets: [
        { title: 'Epic', type: 'Epic' },
        { title: 'A', epicPosition: 0, originPosition: 0 },
      ],
    });

    expect(announced).toEqual([
      { type: 'tickets', numbers: created.map(({ number }) => number) },
    ]);
  });

  it.each([
    [
      'a later position',
      [
        { title: 'A', epicPosition: 1 },
        { title: 'E', type: 'Epic' as const },
      ],
      0,
    ],
    [
      'its own position',
      [
        { title: 'E', type: 'Epic' as const },
        { title: 'A', epicPosition: 1 },
      ],
      1,
    ],
    [
      'an out-of-range position',
      [
        { title: 'E', type: 'Epic' as const },
        { title: 'A', epicPosition: 7 },
      ],
      1,
    ],
    [
      'a Ticket that is not an Epic',
      [{ title: 'P' }, { title: 'A', epicPosition: 0 }],
      1,
    ],
  ])('refuses epicPosition naming %s', (_, batch, position) => {
    const error = refusal(batch);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors).toHaveProperty(
      `tickets[${position}].epicPosition`,
    );
    expect((error as Error).message).toContain(`position ${position}`);
  });

  it('refuses an Epic with epicPosition or the batch epicNumber', () => {
    expect(
      refusal([
        { title: 'E', type: 'Epic' },
        { title: 'F', type: 'Epic', epicPosition: 0 },
      ]),
    ).toBeInstanceOf(ValidationError);

    const { tickets, project } = setUp();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Earlier',
      type: 'Epic',
    });
    const error = errorFrom(() =>
      tickets.createTicketBatch({
        projectId: project.id,
        epicNumber: epic.number,
        tickets: [{ title: 'Nested', type: 'Epic' }],
      }),
    );
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as Error).message).toContain('position 0');
  });

  it.each([
    [
      'a later position',
      [{ title: 'A', originPosition: 1 }, { title: 'B' }],
      0,
    ],
    [
      'its own position',
      [{ title: 'A' }, { title: 'B', originPosition: 1 }],
      1,
    ],
    [
      'an out-of-range position',
      [{ title: 'A' }, { title: 'B', originPosition: 9 }],
      1,
    ],
  ])('refuses originPosition naming %s', (_, batch, position) => {
    const error = refusal(batch);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).fieldErrors).toHaveProperty(
      `tickets[${position}].originPosition`,
    );
  });

  it('refuses a position field with the matching batch-level field', () => {
    const { tickets, project } = setUp();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Earlier',
      type: 'Epic',
    });
    const spec = tickets.createTicket({ projectId: project.id, title: 'Spec' });

    expect(
      errorFrom(() =>
        tickets.createTicketBatch({
          projectId: project.id,
          epicNumber: epic.number,
          tickets: [
            { title: 'E', type: 'Epic' },
            { title: 'A', epicPosition: 0 },
          ],
        }),
      ),
    ).toBeInstanceOf(ValidationError);
    expect(
      errorFrom(() =>
        tickets.createTicketBatch({
          projectId: project.id,
          originNumber: spec.number,
          tickets: [{ title: 'A' }, { title: 'B', originPosition: 0 }],
        }),
      ),
    ).toBeInstanceOf(ValidationError);
  });

  it('makes an existing Ticket the Origin of one Ticket of the batch', () => {
    const { tickets, project } = setUp();
    const ideas = tickets.createProject({ name: 'Ideas' });
    const idea = tickets.createTicket({ projectId: ideas.id, title: 'Idea' });
    const spec = tickets.createTicket({ projectId: project.id, title: 'Spec' });
    const announced: Change[] = [];
    tickets.subscribe((change) => announced.push(change));

    const [epic, child, other, loose] = tickets.createTicketBatch({
      projectId: project.id,
      tickets: [
        { title: 'Epic', type: 'Epic', originNumber: idea.number },
        { title: 'Child', epicPosition: 0 },
        { title: 'Other', originNumber: spec.number },
        { title: 'Loose' },
      ],
    });

    expect(tickets.getTicket(epic.number).origin?.number).toBe(idea.number);
    expect(tickets.getTicket(child.number).epic?.number).toBe(epic.number);
    expect(tickets.getTicket(child.number).origin).toBeNull();
    expect(tickets.getTicket(other.number).origin?.number).toBe(spec.number);
    expect(tickets.getTicket(loose.number).origin).toBeNull();
    expect(
      tickets.getTicket(idea.number).splitOff.map(({ number }) => number),
    ).toEqual([epic.number]);
    expect(announced).toEqual([
      {
        type: 'tickets',
        numbers: expect.arrayContaining([
          epic.number,
          child.number,
          other.number,
          loose.number,
          spec.number,
          idea.number,
        ]),
      },
    ]);
  });

  it('refuses a missing Origin of one Ticket, naming its position', () => {
    const { tickets, project } = setUp();
    tickets.createTicket({ projectId: project.id, title: 'Existing' });

    const error = errorFrom(() =>
      tickets.createTicketBatch({
        projectId: project.id,
        tickets: [{ title: 'A' }, { title: 'B', originNumber: 999 }],
      }),
    );

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as Error).message).toContain('position 1');
    expect((error as Error).message).toContain('T999');
    expect(tickets.listTickets()).toHaveLength(1);
  });

  it('refuses a Ticket originNumber with originPosition or the batch originNumber', () => {
    const { tickets, project } = setUp();
    const spec = tickets.createTicket({ projectId: project.id, title: 'Spec' });
    const attempt = (input: { originNumber?: number; tickets: Batch }) => {
      const error = errorFrom(() =>
        tickets.createTicketBatch({ projectId: project.id, ...input }),
      );
      expect(tickets.listTickets()).toHaveLength(1);
      return error as ValidationError;
    };

    const withPosition = attempt({
      tickets: [
        { title: 'A' },
        { title: 'B', originNumber: spec.number, originPosition: 0 },
      ],
    });
    expect(withPosition).toBeInstanceOf(ValidationError);
    expect(withPosition.fieldErrors).toHaveProperty('tickets[1].originNumber');
    expect(withPosition.message).toContain('position 1');

    const withBatch = attempt({
      originNumber: spec.number,
      tickets: [{ title: 'A' }, { title: 'B', originNumber: spec.number }],
    });
    expect(withBatch).toBeInstanceOf(ValidationError);
    expect(withBatch.fieldErrors).toHaveProperty('tickets[1].originNumber');
    expect(withBatch.message).toContain('position 1');
  });

  it('refuses a colour on a normal Ticket by position', () => {
    const error = refusal([{ title: 'A' }, { title: 'B', color: 'red' }]);

    expect((error as ValidationError).fieldErrors).toHaveProperty(
      'tickets[1].color',
    );
  });
});
