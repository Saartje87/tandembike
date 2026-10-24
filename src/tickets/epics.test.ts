// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import { NotAllowedError, NotFoundError } from './errors';

const setUp = () => {
  const tickets = createTestTickets();
  const project = tickets.createProject({ name: 'Website' });
  const epic = tickets.createTicket({
    projectId: project.id,
    title: 'Checkout',
    type: 'Epic',
  });
  return { tickets, project, epic };
};

describe('Creating an Epic', () => {
  it('creates an Epic, and a normal Ticket by default', () => {
    const { tickets, project, epic } = setUp();

    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });

    expect(tickets.getTicket(epic.number)).toMatchObject({
      type: 'Epic',
      epic: null,
      children: [],
    });
    expect(ticket).toMatchObject({ type: 'Ticket', epic: null, children: [] });
  });
});

describe('Creating a Ticket under an Epic', () => {
  it('links the child to its Epic and lists it as a child', () => {
    const { tickets, project, epic } = setUp();

    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
    });

    expect(child.epic).toEqual({ number: epic.number, title: 'Checkout' });
    expect(tickets.getTicket(epic.number).children).toEqual([
      {
        number: child.number,
        title: 'Pay by card',
        status: 'Todo',
        archived: false,
        blockedBy: [],
        blocked: false,
      },
    ]);
  });

  it('refuses a parent that is not an Epic', () => {
    const { tickets, project } = setUp();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });

    expect(
      errorFrom(() =>
        tickets.createTicket({
          projectId: project.id,
          title: 'Pay by card',
          epicNumber: ticket.number,
        }),
      ),
    ).toEqual(
      new NotAllowedError(
        `Ticket #${ticket.number} is not an Epic. Only an Epic can have child Tickets.`,
      ),
    );
  });

  it('refuses an Epic as a child', () => {
    const { tickets, project, epic } = setUp();

    expect(
      errorFrom(() =>
        tickets.createTicket({
          projectId: project.id,
          title: 'Payments',
          type: 'Epic',
          epicNumber: epic.number,
        }),
      ),
    ).toEqual(
      new NotAllowedError('An Epic cannot be a child of another Epic.'),
    );
  });

  it('refuses an Epic in another Project, creating nothing', () => {
    const { tickets, epic } = setUp();
    const app = tickets.createProject({ name: 'App' });

    expect(
      errorFrom(() =>
        tickets.createTicket({
          projectId: app.id,
          title: 'Pay by card',
          epicNumber: epic.number,
        }),
      ),
    ).toEqual(
      new NotAllowedError(
        `Epic #${epic.number} is in another Project. An Epic holds only its own Project's Tickets.`,
      ),
    );
    expect(tickets.listTickets({ projectId: app.id })).toEqual([]);
  });

  it('refuses an Epic that does not exist', () => {
    const { tickets, project } = setUp();

    expect(
      errorFrom(() =>
        tickets.createTicket({
          projectId: project.id,
          title: 'Pay by card',
          epicNumber: 99,
        }),
      ),
    ).toEqual(new NotFoundError('There is no Ticket #99.'));
  });
});

describe('Attaching and detaching', () => {
  it('attaches an existing Ticket to an Epic and detaches it again', () => {
    const { tickets, project, epic } = setUp();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
    });

    const attached = tickets.attachToEpic({
      epic: epic.number,
      child: ticket.number,
    });

    expect(attached.epic).toEqual({ number: epic.number, title: 'Checkout' });
    expect(
      tickets.getTicket(epic.number).children.map(({ number }) => number),
    ).toEqual([ticket.number]);

    const detached = tickets.detachFromEpic(ticket.number);

    expect(detached.epic).toBeNull();
    expect(tickets.getTicket(epic.number).children).toEqual([]);
  });
});

describe('Attaching refusals', () => {
  it('refuses a Ticket that is already in another Epic', () => {
    const { tickets, project, epic } = setUp();
    const other = tickets.createTicket({
      projectId: project.id,
      title: 'Payments',
      type: 'Epic',
    });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: other.number,
    });

    expect(
      errorFrom(() =>
        tickets.attachToEpic({ epic: epic.number, child: child.number }),
      ),
    ).toEqual(
      new NotAllowedError(
        `Ticket #${child.number} is already in Epic #${other.number}. Detach it from that Epic first.`,
      ),
    );
  });

  it('refuses to attach an Epic', () => {
    const { tickets, project, epic } = setUp();
    const other = tickets.createTicket({
      projectId: project.id,
      title: 'Payments',
      type: 'Epic',
    });

    expect(
      errorFrom(() =>
        tickets.attachToEpic({ epic: epic.number, child: other.number }),
      ),
    ).toEqual(
      new NotAllowedError(
        `Ticket #${other.number} is an Epic, and an Epic cannot be a child of another Epic.`,
      ),
    );
  });
});

describe('Moving a grouped Ticket to another Project', () => {
  it('refuses to move a child', () => {
    const { tickets, project, epic } = setUp();
    const app = tickets.createProject({ name: 'App' });
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
    });

    expect(
      errorFrom(() =>
        tickets.updateTicket(child.number, { projectId: app.id }),
      ),
    ).toEqual(
      new NotAllowedError(
        `Ticket #${child.number} is in Epic #${epic.number}. Detach it from its Epic before moving it to another Project.`,
      ),
    );
    expect(tickets.getTicket(child.number).projectId).toBe(project.id);
  });

  it('refuses to move an Epic with children, but not one without', () => {
    const { tickets, project, epic } = setUp();
    const app = tickets.createProject({ name: 'App' });
    const empty = tickets.createTicket({
      projectId: project.id,
      title: 'Payments',
      type: 'Epic',
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
    });

    expect(
      errorFrom(() => tickets.updateTicket(epic.number, { projectId: app.id })),
    ).toEqual(
      new NotAllowedError(
        `Epic #${epic.number} has child Tickets. Detach them before moving it to another Project.`,
      ),
    );
    expect(
      tickets.updateTicket(empty.number, { projectId: app.id }).projectId,
    ).toBe(app.id);
  });
});
