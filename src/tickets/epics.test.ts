// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestTickets, errorFrom } from '../test/tickets';
import type { Change } from './changes';
import { NotAllowedError, NotFoundError, ValidationError } from './errors';
import type { PaletteColor } from './palette';
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

describe('Listing Epics', () => {
  it("lists only a Project's Epics, oldest-created first", () => {
    const { tickets, project, epic } = setUp();
    tickets.createTicket({ projectId: project.id, title: 'Fix the header' });
    const later = tickets.createTicket({
      projectId: project.id,
      title: 'Search',
      type: 'Epic',
    });
    const other = tickets.createProject({ name: 'App' });
    tickets.createTicket({ projectId: other.id, title: 'Login', type: 'Epic' });

    expect(
      tickets
        .listTickets({ projectId: project.id, type: 'Epic' })
        .map(({ number }) => number),
    ).toEqual([epic.number, later.number]);
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

    expect(child.epic).toEqual({
      number: epic.number,
      title: 'Checkout',
      color: 'red',
    });
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
        `Ticket T${ticket.number} is not an Epic. Only an Epic can have child Tickets.`,
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
        `Epic T${epic.number} is in another Project. An Epic holds only its own Project's Tickets.`,
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
    ).toEqual(new NotFoundError('There is no Ticket T99.'));
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

    expect(attached.epic).toEqual({
      number: epic.number,
      title: 'Checkout',
      color: 'red',
    });
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
        `Ticket T${child.number} is already in Epic T${other.number}. Detach it from that Epic first.`,
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
        `Ticket T${other.number} is an Epic, and an Epic cannot be a child of another Epic.`,
      ),
    );
  });
});

describe('Moving a Ticket to an Epic', () => {
  it('attaches a Ticket in no Epic', () => {
    const { tickets, project, epic } = setUp();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
    });

    const moved = tickets.moveToEpic({
      epic: epic.number,
      child: ticket.number,
    });

    expect(moved.epic).toEqual({
      number: epic.number,
      title: 'Checkout',
      color: 'red',
    });
  });

  it('takes a Ticket out of its Epic into another, and both Statuses follow', () => {
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
      status: 'In progress',
    });
    const changes: Change[] = [];
    tickets.subscribe((change) => changes.push(change));

    tickets.moveToEpic({ epic: epic.number, child: child.number });

    expect(tickets.getTicket(child.number).epic?.number).toBe(epic.number);
    expect(tickets.getTicket(other.number)).toMatchObject({
      status: 'Todo',
      children: [],
    });
    expect(tickets.getTicket(epic.number).status).toBe('In progress');
    expect(changes).toContainEqual({
      type: 'tickets',
      numbers: [other.number, epic.number, child.number],
    });
  });

  it('checks the rules of attaching', () => {
    const { tickets, project, epic } = setUp();
    const other = tickets.createTicket({
      projectId: project.id,
      title: 'Payments',
      type: 'Epic',
    });

    expect(
      errorFrom(() =>
        tickets.moveToEpic({ epic: epic.number, child: other.number }),
      ),
    ).toEqual(
      new NotAllowedError(
        `Ticket T${other.number} is an Epic, and an Epic cannot be a child of another Epic.`,
      ),
    );
  });

  it('refuses a Blocker between the Ticket and its new Epic, leaving it where it was', () => {
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
    tickets.addBlocker({ blocker: child.number, blocked: epic.number });

    expect(
      errorFrom(() =>
        tickets.moveToEpic({ epic: epic.number, child: child.number }),
      ),
    ).toBeInstanceOf(NotAllowedError);
    expect(tickets.getTicket(child.number).epic?.number).toBe(other.number);
  });
});

describe('Moving several Tickets to an Epic', () => {
  it('attaches every Ticket, leaving their Statuses and positions alone', () => {
    const { tickets, project, epic } = setUp();
    const first = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
    });
    const second = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by bank',
      status: 'In progress',
    });
    const before = [first, second].map((ticket) =>
      tickets.getTicket(ticket.number),
    );
    const changes: Change[] = [];
    tickets.subscribe((change) => changes.push(change));

    tickets.moveTicketsToEpic({
      epic: epic.number,
      children: [first.number, second.number],
    });

    for (const ticket of before) {
      expect(tickets.getTicket(ticket.number)).toMatchObject({
        epic: { number: epic.number },
        status: ticket.status,
        position: ticket.position,
      });
    }
    expect(tickets.getTicket(epic.number)).toMatchObject({
      status: 'In progress',
      children: [{ number: first.number }, { number: second.number }],
    });
    expect(changes).toEqual([
      {
        type: 'tickets',
        numbers: [epic.number, first.number, second.number],
      },
    ]);
  });

  it('takes Tickets out of another Epic, and its Status follows', () => {
    const { tickets, project, epic } = setUp();
    const other = tickets.createTicket({
      projectId: project.id,
      title: 'Payments',
      type: 'Epic',
    });
    const moving = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: other.number,
      status: 'Done',
    });
    const staying = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by bank',
      epicNumber: other.number,
    });
    const free = tickets.createTicket({
      projectId: project.id,
      title: 'Pay later',
    });
    const changes: Change[] = [];
    tickets.subscribe((change) => changes.push(change));

    tickets.moveTicketsToEpic({
      epic: epic.number,
      children: [moving.number, free.number],
    });

    expect(tickets.getTicket(epic.number)).toMatchObject({
      status: 'In progress',
      children: [{ number: moving.number }, { number: free.number }],
    });
    expect(tickets.getTicket(other.number)).toMatchObject({
      status: 'Todo',
      children: [{ number: staying.number }],
    });
    expect(changes).toEqual([
      {
        type: 'tickets',
        numbers: [other.number, epic.number, moving.number, free.number],
      },
    ]);
  });

  it('moves none of the Tickets when one cannot join', () => {
    const { tickets, project, epic } = setUp();
    const other = tickets.createTicket({
      projectId: project.id,
      title: 'Payments',
      type: 'Epic',
    });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: other.number,
    });
    const changes: Change[] = [];
    tickets.subscribe((change) => changes.push(change));

    expect(
      errorFrom(() =>
        tickets.moveTicketsToEpic({
          epic: epic.number,
          children: [ticket.number, other.number],
        }),
      ),
    ).toEqual(
      new NotAllowedError(
        `Ticket T${other.number} is an Epic, and an Epic cannot be a child of another Epic.`,
      ),
    );
    expect(tickets.getTicket(ticket.number).epic?.number).toBe(other.number);
    expect(tickets.getTicket(epic.number).children).toEqual([]);
    expect(changes).toEqual([]);
  });

  it('changes and announces nothing when every Ticket is in the Epic already', () => {
    const { tickets, project, epic } = setUp();
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
    });
    const changes: Change[] = [];
    tickets.subscribe((change) => changes.push(change));

    tickets.moveTicketsToEpic({ epic: epic.number, children: [child.number] });

    expect(changes).toEqual([]);
  });

  it('refuses an empty or repeated list', () => {
    const { tickets, project, epic } = setUp();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
    });

    expect(
      errorFrom(() =>
        tickets.moveTicketsToEpic({ epic: epic.number, children: [] }),
      ),
    ).toEqual(new ValidationError({ children: 'Choose at least one Ticket.' }));
    expect(
      errorFrom(() =>
        tickets.moveTicketsToEpic({
          epic: epic.number,
          children: [ticket.number, ticket.number],
        }),
      ),
    ).toEqual(
      new ValidationError({
        children: `Choose each Ticket once: T${ticket.number} is given twice.`,
      }),
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
        `Ticket T${child.number} is in Epic T${epic.number}. Detach it from its Epic before moving it to another Project.`,
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
        `Epic T${epic.number} has child Tickets. Detach them before moving it to another Project.`,
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
      status: `Ticket T${number} is an Epic. Its Status follows its child Tickets and cannot be set by hand.`,
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
        `Epic T${epic.number} has child Tickets that are not archived: T${child.number}. Archive or detach them first.`,
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
      blocker: `T${child.number} is a child of Epic T${epic.number}. An Epic and its own children cannot block each other; order the children with Blockers among themselves.`,
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
        `T${ticket.number} blocks T${epic.number}. An Epic and its own children cannot block each other; remove that Blocker first.`,
      ),
    );
  });
});

describe('Claiming an Epic', () => {
  const run1 = { agentRunId: 'run-1', agentName: 'Frontend Agent' };
  const run2 = { agentRunId: 'run-2' };

  const epicWithChildren = () => {
    const { tickets, project, epic } = setUp();
    const [first, second] = ['First', 'Second'].map((title) =>
      tickets.createTicket({
        projectId: project.id,
        title,
        epicNumber: epic.number,
      }),
    );
    return { tickets, project, epic, first, second };
  };

  it('covers its children: another run cannot claim one', () => {
    const { tickets, epic, first } = epicWithChildren();
    tickets.claimTicket(epic.number, run1);

    expect(errorFrom(() => tickets.claimTicket(first.number, run2))).toEqual(
      new NotAllowedError(
        `Ticket T${first.number} is in Epic T${epic.number}, which is claimed by Frontend Agent (run-1). Claiming an Epic covers its children.`,
      ),
    );
    expect(tickets.getTicket(first.number).claim).toBeNull();
  });

  it("lets the Epic's own run claim a child too", () => {
    const { tickets, epic, first } = epicWithChildren();
    tickets.claimTicket(epic.number, run1);

    expect(tickets.claimTicket(first.number, run1).claim).toEqual(run1);
  });

  it('lets a child be claimed alone while its Epic is unclaimed', () => {
    const { tickets, first } = epicWithChildren();

    expect(tickets.claimTicket(first.number, run2).claim).toEqual({
      agentRunId: 'run-2',
      agentName: null,
    });
  });

  it('is refused while another run holds a child', () => {
    const { tickets, epic, first } = epicWithChildren();
    tickets.claimTicket(first.number, run2);

    expect(errorFrom(() => tickets.claimTicket(epic.number, run1))).toEqual(
      new NotAllowedError(
        `Epic T${epic.number} has child Ticket T${first.number} claimed by Agent run run-2. Claiming an Epic covers its children, so that claim must be released first.`,
      ),
    );
  });

  it('is released when the Epic reaches Done', () => {
    const { tickets, epic, first, second } = epicWithChildren();
    tickets.claimTicket(epic.number, run1);

    tickets.updateTicket(first.number, { status: 'Done' });
    expect(tickets.getTicket(epic.number).claim).toEqual(run1);

    tickets.updateTicket(second.number, { status: 'Done' });
    expect(tickets.getTicket(epic.number)).toMatchObject({
      status: 'Done',
      claim: null,
    });
  });

  it('is refused when all its children are Done', () => {
    const { tickets, epic, first, second } = epicWithChildren();
    tickets.updateTickets({
      ticketNumbers: [first.number, second.number],
      status: 'Done',
    });

    expect(errorFrom(() => tickets.claimTicket(epic.number, run1))).toEqual(
      new NotAllowedError(
        `Epic T${epic.number} is Done: all its child Tickets are Done, so there is nothing left to claim.`,
      ),
    );
  });

  it("frees its children when the User clears the Epic's claim", () => {
    const { tickets, epic, first } = epicWithChildren();
    tickets.claimTicket(epic.number, run1);

    tickets.clearTicketClaim(epic.number);

    expect(tickets.claimTicket(first.number, run2).claim?.agentRunId).toBe(
      'run-2',
    );
  });

  it("counts a claimed Epic's children as claimed when finding work", () => {
    const { tickets, project, epic, first, second } = epicWithChildren();
    const loose = tickets.createTicket({
      projectId: project.id,
      title: 'Loose',
    });
    tickets.claimTicket(epic.number, run1);

    const numbers = (claimed: boolean) =>
      tickets
        .listTickets({ projectId: project.id, claimed })
        .map(({ number }) => number);

    expect(numbers(false)).toEqual([loose.number]);
    expect(numbers(true)).toEqual([epic.number, first.number, second.number]);
  });
});

describe('Archived children', () => {
  it('keeps a Done Epic Done once all its children are archived', () => {
    const { tickets, project, epic } = setUp();
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
      status: 'Done',
    });

    tickets.archiveTicket(child.number);

    expect(tickets.getTicket(epic.number).status).toBe('Done');
  });

  it('moves an Epic to Done once every child is archived, finished or not', () => {
    const { tickets, project, epic } = setUp();
    const done = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
      status: 'Done',
    });
    const dropped = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by cheque',
      epicNumber: epic.number,
    });
    expect(tickets.getTicket(epic.number).status).toBe('In progress');

    tickets.archiveTicket(dropped.number);
    tickets.archiveTicket(done.number);

    expect(tickets.getTicket(epic.number).status).toBe('Done');
  });

  it('moves an Epic back from Done when an archived child that is not Done is restored', () => {
    const { tickets, project, epic } = setUp();
    const dropped = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by cheque',
      epicNumber: epic.number,
    });
    tickets.archiveTicket(dropped.number);
    expect(tickets.getTicket(epic.number).status).toBe('Done');

    tickets.restoreTicket(dropped.number);

    expect(tickets.getTicket(epic.number).status).toBe('Todo');
  });

  it('refuses to restore a child of an archived Epic', () => {
    const { tickets, project, epic } = setUp();
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
    });
    tickets.archiveTicket(child.number);
    tickets.archiveTicket(epic.number);

    expect(errorFrom(() => tickets.restoreTicket(child.number))).toEqual(
      new NotAllowedError(
        `Ticket T${child.number} is in Epic T${epic.number}, which is archived. Restore the Epic first.`,
      ),
    );
    expect(tickets.getTicket(child.number).archived).toBe(true);
  });
});

describe('Epic colours', () => {
  const newEpic = (
    tickets: ReturnType<typeof setUp>['tickets'],
    projectId: number,
    color?: PaletteColor,
  ) =>
    tickets.createTicket({
      projectId,
      title: 'Epic',
      type: 'Epic',
      ...(color === undefined ? {} : { color }),
    });

  it('gives a new Epic the colour fewest live Epics in its Project use, in palette order', () => {
    const { tickets, project, epic } = setUp();
    const other = tickets.createProject({ name: 'App' });
    newEpic(tickets, other.id, 'orange');
    const archived = newEpic(tickets, project.id, 'orange');
    tickets.archiveTicket(archived.number);

    expect(epic.color).toBe('red');
    expect(newEpic(tickets, project.id).color).toBe('orange');
    expect(newEpic(tickets, project.id, 'red').color).toBe('red');
    expect(newEpic(tickets, project.id).color).toBe('amber');
  });

  it('gives normal Tickets none, and refuses one', () => {
    const { tickets, project } = setUp();

    expect(
      tickets.createTicket({ projectId: project.id, title: 'Fix it' }).color,
    ).toBeNull();
    expect(
      errorFrom(() =>
        tickets.createTicket({
          projectId: project.id,
          title: 'Fix it',
          color: 'teal',
        }),
      ),
    ).toEqual(
      new ValidationError({
        color: 'Only an Epic has a colour. Leave the colour out.',
      }),
    );
  });

  it('refuses a colour outside the palette', () => {
    const { tickets, project, epic } = setUp();
    const rule = new ValidationError({
      color:
        'Choose one of these colours: red, orange, amber, green, teal, blue, indigo, purple, pink, grey.',
    });

    expect(
      errorFrom(() => newEpic(tickets, project.id, 'beige' as PaletteColor)),
    ).toEqual(rule);
    expect(
      errorFrom(() =>
        tickets.updateTicket(epic.number, { color: 'beige' as PaletteColor }),
      ),
    ).toEqual(rule);
  });

  it("changes an Epic's colour, which its children's Epic link carries", () => {
    const { tickets, project, epic } = setUp();
    const child = tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
    });

    expect(tickets.updateTicket(epic.number, { color: 'teal' }).color).toBe(
      'teal',
    );
    expect(tickets.getTicket(child.number).epic).toEqual({
      number: epic.number,
      title: 'Checkout',
      color: 'teal',
    });
  });

  it('refuses to colour a normal Ticket', () => {
    const { tickets, project } = setUp();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix it',
    });

    expect(
      errorFrom(() => tickets.updateTicket(ticket.number, { color: 'teal' })),
    ).toEqual(
      new ValidationError({
        color: `Ticket T${ticket.number} is not an Epic. Only an Epic has a colour.`,
      }),
    );
  });

  it('colours the Epics of a batch and fails its normal Tickets', () => {
    const { tickets, project, epic } = setUp();
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Fix it',
    });

    const result = tickets.updateTickets({
      ticketNumbers: [epic.number, ticket.number],
      color: 'pink',
    });

    expect(result.updated.map(({ number, color }) => [number, color])).toEqual([
      [epic.number, 'pink'],
    ]);
    expect(result.failed).toEqual([
      {
        number: ticket.number,
        error: `Ticket T${ticket.number} is not an Epic. Only an Epic has a colour.`,
      },
    ]);
  });
});
