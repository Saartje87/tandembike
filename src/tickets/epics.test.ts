// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import type { Change } from './changes';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';
import type { Status } from './status';

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

describe("An Epic's derived Status", () => {
  /** An Epic with children in the given Statuses, created in order. */
  const epicWith = (...statuses: Status[]) => {
    const { tickets, project, epic } = setUp();
    const children = statuses.map((status, index) =>
      tickets.createTicket({
        projectId: project.id,
        title: `Child ${index + 1}`,
        epicNumber: epic.number,
        status,
      }),
    );
    const statusOf = () => tickets.getTicket(epic.number).status;
    return { tickets, project, epic, children, statusOf };
  };

  it.each<[string, Status[], Status]>([
    ['no children', [], 'Todo'],
    ['all children Todo', ['Todo', 'Todo'], 'Todo'],
    ['a child started', ['Todo', 'In progress'], 'In progress'],
    ['only some children Done', ['Todo', 'Done'], 'In progress'],
    ['all children Done', ['Done', 'Done'], 'Done'],
  ])('is derived from its children: %s', (_, statuses, expected) => {
    const { statusOf } = epicWith(...statuses);

    expect(statusOf()).toBe(expected);
  });

  it('follows its children as they change Status', () => {
    const { tickets, children, statusOf } = epicWith('Todo', 'Todo');

    tickets.updateTicket(children[0].number, { status: 'In progress' });
    expect(statusOf()).toBe('In progress');

    tickets.updateTickets({
      ticketNumbers: children.map(({ number }) => number),
      status: 'Done',
    });
    expect(statusOf()).toBe('Done');

    tickets.updateTicket(children[1].number, { status: 'Todo' });
    expect(statusOf()).toBe('In progress');
  });

  it('follows children joining and leaving it', () => {
    const { tickets, project, epic, children, statusOf } = epicWith('Done');
    const started = tickets.createTicket({
      projectId: project.id,
      title: 'Started elsewhere',
      status: 'In progress',
    });

    tickets.attachToEpic({ epic: epic.number, child: started.number });
    expect(statusOf()).toBe('In progress');

    tickets.detachFromEpic(started.number);
    expect(statusOf()).toBe('Done');

    tickets.detachFromEpic(children[0].number);
    expect(statusOf()).toBe('Todo');
  });

  it('leaves archived children out', () => {
    const { tickets, children, statusOf } = epicWith('Done', 'In progress');

    tickets.archiveTicket(children[1].number);
    expect(statusOf()).toBe('Done');

    tickets.restoreTicket(children[1].number);
    expect(statusOf()).toBe('In progress');
  });

  it('moves the Epic to the end of its new Status lane', () => {
    const { tickets, project, children } = epicWith('Todo');
    const inProgress = tickets.createTicket({
      projectId: project.id,
      title: 'Already started',
      status: 'In progress',
    });

    const epic = tickets.updateTicket(children[0].number, {
      status: 'In progress',
    }).epic;

    expect(
      tickets
        .listTickets({ projectId: project.id, status: 'In progress' })
        .sort((left, right) => left.position - right.position)
        .map(({ number }) => number),
    ).toEqual([inProgress.number, children[0].number, epic?.number]);
  });

  it('is announced when it changes', () => {
    const { tickets, children, epic } = epicWith('Todo');
    const announced: Change[] = [];
    tickets.subscribe((change) => announced.push(change));

    tickets.updateTicket(children[0].number, { status: 'Done' });

    expect(announced).toEqual([
      { type: 'tickets', numbers: [children[0].number, epic.number] },
    ]);
  });
});

describe("Setting an Epic's Status by hand", () => {
  const byHand = (number: number) =>
    new ValidationError({
      status: `Ticket #${number} is an Epic. Its Status follows its child Tickets and cannot be set by hand.`,
    });

  it('is refused', () => {
    const { tickets, epic } = setUp();

    expect(
      errorFrom(() => tickets.updateTicket(epic.number, { status: 'Done' })),
    ).toEqual(byHand(epic.number));
    expect(tickets.getTicket(epic.number).status).toBe('Todo');
  });

  it('allows other changes that name the Status it has', () => {
    const { tickets, epic } = setUp();

    expect(
      tickets.updateTicket(epic.number, { status: 'Todo', title: 'Pay' }),
    ).toMatchObject({ status: 'Todo', title: 'Pay' });
  });

  it('fails the Epic in a batch and changes the others', () => {
    const { tickets, project, epic } = setUp();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix the header',
    });

    const result = tickets.updateTickets({
      ticketNumbers: [epic.number, ticket.number],
      status: 'Done',
    });

    expect(result.failed).toEqual([
      { number: epic.number, error: byHand(epic.number).message },
    ]);
    expect(result.updated.map(({ number }) => number)).toEqual([ticket.number]);
  });

  it('is refused when creating an Epic', () => {
    const { tickets, project } = setUp();

    expect(
      errorFrom(() =>
        tickets.createTicket({
          projectId: project.id,
          title: 'Payments',
          type: 'Epic',
          status: 'In progress',
        }),
      ),
    ).toEqual(
      new ValidationError({
        status:
          "An Epic's Status follows its child Tickets. Leave the Status out.",
      }),
    );
  });

  it('is not changed by checking off its acceptance criteria', () => {
    const { tickets, project } = setUp();
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Payments',
      type: 'Epic',
      acceptanceCriteria: [{ text: 'Cards work' }],
    });

    const checked = tickets.setAcceptanceCriteriaChecked(epic.number, [
      { id: epic.acceptanceCriteria[0].id, checked: true },
    ]);

    expect(checked).toMatchObject({
      status: 'Todo',
      acceptanceCriteria: [{ text: 'Cards work', checked: true }],
    });
  });
});

describe('Archiving an Epic', () => {
  it('is refused while any child is not archived', () => {
    const { tickets, project, epic } = setUp();
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
    });

    expect(errorFrom(() => tickets.archiveTicket(epic.number))).toEqual(
      new NotAllowedError(
        `Epic #${epic.number} has child Tickets that are not archived: #${child.number}. Archive or detach them first.`,
      ),
    );
    expect(tickets.getTicket(epic.number).archived).toBe(false);

    tickets.archiveTicket(child.number);
    expect(tickets.archiveTicket(epic.number).archived).toBe(true);
  });
});

describe('Blockers and Epics', () => {
  it('refuses a Blocker between an Epic and its own child, either way', () => {
    const { tickets, project, epic } = setUp();
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
    });
    const refusal = new ValidationError({
      blocker: `#${child.number} is a child of Epic #${epic.number}. An Epic and its own children cannot block each other; order the children with Blockers among themselves.`,
    });

    expect(
      errorFrom(() =>
        tickets.addBlocker({ blocker: epic.number, blocked: child.number }),
      ),
    ).toEqual(refusal);
    expect(
      errorFrom(() =>
        tickets.addBlocker({ blocker: child.number, blocked: epic.number }),
      ),
    ).toEqual(refusal);
  });

  it('allows Blockers among children, and between an Epic and other Tickets', () => {
    const { tickets, project, epic } = setUp();
    const [first, second] = ['First', 'Second'].map((title) =>
      tickets.createTicket({
        projectId: project.id,
        title,
        epicNumber: epic.number,
      }),
    );
    const other = tickets.createTicket({
      projectId: project.id,
      title: 'Design',
    });

    tickets.addBlocker({ blocker: first.number, blocked: second.number });
    tickets.addBlocker({ blocker: other.number, blocked: epic.number });

    expect(tickets.getTicket(epic.number)).toMatchObject({
      blockedBy: [other.number],
      children: [
        { number: first.number, blockedBy: [], blocked: false },
        { number: second.number, blockedBy: [first.number], blocked: true },
      ],
    });
  });

  it('refuses to attach a Ticket that blocks or is blocked by the Epic', () => {
    const { tickets, project, epic } = setUp();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Design',
    });
    tickets.addBlocker({ blocker: ticket.number, blocked: epic.number });

    expect(
      errorFrom(() =>
        tickets.attachToEpic({ epic: epic.number, child: ticket.number }),
      ),
    ).toEqual(
      new NotAllowedError(
        `#${ticket.number} blocks #${epic.number}. An Epic and its own children cannot block each other; remove that Blocker first.`,
      ),
    );
  });
});
