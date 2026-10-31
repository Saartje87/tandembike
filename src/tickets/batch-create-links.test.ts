// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import type { Change } from './changes';
import { ValidationError } from './errors';

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

  it('refuses a colour on a normal Ticket by position', () => {
    const error = refusal([{ title: 'A' }, { title: 'B', color: 'red' }]);

    expect((error as ValidationError).fieldErrors).toHaveProperty(
      'tickets[1].color',
    );
  });
});
