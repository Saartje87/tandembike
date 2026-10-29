import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { moveTicketsToCycle } from '../../app/cycles/actions';
import { noBoardFilter } from '../../app/lib/paths';
import {
  archiveTickets,
  createTicket,
  moveTickets,
  moveTicketsToEpic,
  reorderTickets,
  updateTicket,
} from '../../app/tickets/actions';
import {
  keyboardDrag,
  nextFrame,
  stubDragAndDrop,
} from '../../test/drag-and-drop';
import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import type { Cycle } from '../../tickets/cycles';
import { type Status, statuses } from '../../tickets/status';
import type { Ticket } from '../../tickets/tickets';
import { Board } from './board';

vi.mock('../../app/cycles/actions', () => ({
  moveTicketsToCycle: vi.fn(),
}));
vi.mock('../../app/projects/actions', () => ({
  renameProject: vi.fn(),
  styleProject: vi.fn(),
}));
vi.mock('../../app/tickets/actions', () => ({
  archiveTickets: vi.fn(),
  createTicket: vi.fn(),
  moveTickets: vi.fn(),
  moveTicketsToEpic: vi.fn(),
  reorderTickets: vi.fn(),
  updateTicket: vi.fn(),
}));
stubDragAndDrop();

const project = {
  id: 1,
  name: 'Website',
  color: null,
  icon: null,
  archived: false,
  createdAt: new Date('2026-01-01'),
};

const ticket = (
  fields: Partial<Ticket> & Pick<Ticket, 'number' | 'title'>,
): Ticket => ({
  description: '',
  status: 'Todo',
  projectId: project.id,
  position: 0,
  archived: false,
  labels: [],
  externalReferences: [],
  blockedBy: [],
  blocked: false,
  type: 'Ticket',
  color: null,
  epic: null,
  children: [],
  origin: null,
  splitOff: [],
  cycle: null,
  claim: null,
  acceptanceCriteria: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...fields,
});

/** Each card's accessible title in `column`. */
const cardsIn = (column: string) =>
  within(screen.getByRole('region', { name: column }))
    .queryAllByRole('listitem')
    .filter((item) => isCard(item))
    .map((card) =>
      within(card).getAllByRole('link')[0].getAttribute('aria-label'),
    );

/** Whether `element` is a Ticket card: an Epic chip has no checkbox. */
const isCard = (element: HTMLElement) =>
  element.tagName === 'LI' &&
  element.querySelector('input[type="checkbox"]') !== null;

/** Ticket `number`'s card, which is dragged from anywhere on it (T242). */
const cardOf = (number: number) => {
  const card = screen.getByText(`T${number}`).closest('li');
  if (!card) {
    throw new Error(`No card for T${number}`);
  }
  return card;
};

/** What dnd-kit last announced to a screen reader. */
const announced = () =>
  [...document.querySelectorAll('[aria-live="polite"]')]
    .map((region) => region.textContent)
    .join('');

/**
 * Every announcement dnd-kit makes from now on, in order: a later one can
 * replace an earlier one in its live region before it is seen.
 */
const recordAnnouncements = () => {
  const heard: string[] = [];
  const observer = new MutationObserver(() => {
    const latest = announced();
    if (latest && heard.at(-1) !== latest) {
      heard.push(latest);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
  onTestFinished(() => observer.disconnect());
  return heard;
};

/** The Status of the lane `section`, named by its heading. */
const laneStatus = (section: Element | null) =>
  document.getElementById(section?.getAttribute('aria-labelledby') ?? '')
    ?.textContent;

/**
 * Lays out the Board so a card dragged right lands in `targetStatus`'s lane,
 * on the empty space below that lane's own cards: they have no size, so a
 * keyboard drag passes them over, as a pointer below them would.
 */
const mockBoardBounds = (targetStatus: string) => {
  const isTarget = (section: Element | null) =>
    laneStatus(section) === targetStatus;
  return vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (isCard(this)) {
        return isTarget(this.closest('section'))
          ? new DOMRect(60, 300, 0, 0)
          : new DOMRect(0, 0, 100, 100);
      }
      if (this.tagName === 'SECTION') {
        return isTarget(this)
          ? new DOMRect(60, 0, 100, 300)
          : new DOMRect(500, 0, 100, 300);
      }
      return new DOMRect(0, 0, 800, 700);
    });
};

/**
 * Lays out the Board's lanes side by side, left to right in Status order,
 * with each lane's cards one under another. Returns a function that moves a
 * lane, with its cards, one lane further left.
 */
const mockLaneBounds = () => {
  const laneSpacing = 200;
  const shifted = new Set<string>();
  const left = (section: Element) => {
    const status = laneStatus(section) ?? '';
    return (
      (statuses.indexOf(status as Status) - (shifted.has(status) ? 1 : 0)) *
      laneSpacing
    );
  };
  const bounds = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const section = this.closest('section');
      if (isCard(this) && section) {
        const cards: HTMLElement[] = [...section.querySelectorAll('li')].filter(
          isCard,
        );
        return new DOMRect(
          left(section),
          50 + cards.indexOf(this) * 100,
          100,
          80,
        );
      }
      if (this.tagName === 'SECTION') {
        return new DOMRect(left(this), 0, 100, 400);
      }
      return new DOMRect(0, 0, 800, 700);
    });
  onTestFinished(() => bounds.mockRestore());
  return (status: Status) => shifted.add(status);
};

/** The lanes a dragged card highlights as where it would drop. */
const highlightedLanes = () =>
  screen
    .getAllByRole('region')
    .filter((region) => region.hasAttribute('data-drop-target'))
    .map(laneStatus);

/** Points dnd-kit's hit testing at `status`'s lane for the rest of the test. */
const pointAtLane = (status: string) => {
  const target = screen.getByRole('region', { name: status });
  const elementFromPoint = Object.getOwnPropertyDescriptor(
    document,
    'elementFromPoint',
  );
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => target,
  });
  onTestFinished(() => {
    if (elementFromPoint) {
      Object.defineProperty(document, 'elementFromPoint', elementFromPoint);
    } else {
      Reflect.deleteProperty(document, 'elementFromPoint');
    }
  });
};

const dragTicketTo = async (number: number, status: string) => {
  pointAtLane(status);
  await keyboardDrag(cardOf(number), '{ArrowRight}{ArrowRight}{ArrowRight}');
};

describe('Board', () => {
  beforeEach(() => {
    vi.mocked(reorderTickets).mockReset();
    vi.mocked(updateTicket).mockReset();
  });

  it('leaves the breadcrumbs to the page header', () => {
    renderWithTheme(<Board project={project} tickets={[]} />);

    expect(
      screen.queryByRole('navigation', { name: 'Breadcrumb' }),
    ).not.toBeInTheDocument();
  });

  it('shows every Status column, even when empty', () => {
    renderWithTheme(<Board project={project} tickets={[]} />);

    for (const column of ['Todo', 'In progress', 'Done']) {
      const region = screen.getByRole('region', { name: column });
      expect(within(region).getByText('No Tickets')).toBeInTheDocument();
    }
  });

  it('shows each Ticket as a card with its number and title in its Status column, in the given order', () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={[
          ticket({ number: 4, title: 'Fix the header' }),
          ticket({ number: 2, title: 'Add a footer', status: 'Done' }),
          ticket({ number: 7, title: 'Write the copy' }),
        ]}
      />,
    );

    expect(cardsIn('Todo')).toEqual(['Fix the header', 'Write the copy']);
    expect(cardsIn('In progress')).toEqual([]);
    expect(cardsIn('Done')).toEqual(['Add a footer']);
  });

  it('shows how many active Tickets each Status lane holds', () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={[
          ticket({ number: 1, title: 'One' }),
          ticket({ number: 2, title: 'Two' }),
          ticket({ number: 3, title: 'Three', status: 'Done' }),
          ticket({ number: 4, title: 'Old', status: 'Done', archived: true }),
        ]}
      />,
    );

    const countIn = (status: string) =>
      within(screen.getByRole('region', { name: status })).getByText(
        (_, element) => /^\d+ Tickets?$/.test(element?.textContent ?? ''),
      ).textContent;
    expect(countIn('Todo')).toBe('2 Tickets');
    expect(countIn('In progress')).toBe('0 Tickets');
    expect(countIn('Done')).toBe('1 Ticket');
  });

  it('shows Tickets in their saved priority order within each Status lane', () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={[
          ticket({ number: 7, title: 'Second', position: 1 }),
          ticket({ number: 4, title: 'First', position: 0 }),
          ticket({
            number: 2,
            title: 'Done first',
            status: 'Done',
            position: 0,
          }),
          ticket({
            number: 3,
            title: 'Done second',
            status: 'Done',
            position: 1,
          }),
        ]}
      />,
    );

    expect(cardsIn('Todo')).toEqual(['First', 'Second']);
    expect(cardsIn('Done')).toEqual(['Done first', 'Done second']);
  });

  it('offers to create a Ticket only in the Todo lane', () => {
    renderWithTheme(<Board project={project} tickets={[]} />);

    expect(
      within(screen.getByRole('region', { name: 'Todo' })).getByRole(
        'textbox',
        { name: 'New Ticket title' },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('textbox', { name: 'New Ticket title' }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole('button', { name: 'New Ticket' }),
    ).not.toBeInTheDocument();
  });

  it("plans a Ticket created on a Cycle's tab into that Cycle", async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 9 });
    renderWithTheme(<Board project={project} tickets={[]} cycleId={7} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Ticket title' }),
      'Fix the header{Enter}',
    );

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: project.id,
      title: 'Fix the header',
      cycleId: 7,
    });
  });

  it('does not show a Status dropdown on Ticket cards', () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={[ticket({ number: 4, title: 'Fix the header' })]}
      />,
    );

    expect(within(cardOf(4)).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('moves a Ticket to the dropped-on Status and saves only that Status', async () => {
    const { promise, resolve } = Promise.withResolvers<{
      ok: true;
      projectId: number;
    }>();
    vi.mocked(updateTicket).mockReturnValue(promise);
    const bounds = mockBoardBounds('In progress');
    onTestFinished(async () => {
      await act(async () => resolve({ ok: true, projectId: project.id }));
    });
    onTestFinished(() => bounds.mockRestore());
    renderWithTheme(
      <Board
        project={project}
        tickets={[ticket({ number: 4, title: 'Fix the header' })]}
      />,
    );

    await dragTicketTo(4, 'In progress');

    expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
      number: 4,
      status: 'In progress',
    });
    expect(cardsIn('Todo')).toEqual([]);
    expect(cardsIn('In progress')).toEqual(['Fix the header']);
  });

  it("moves a Ticket dropped below a Lane's last card to the end of that Lane", async () => {
    const { promise, resolve } = Promise.withResolvers<{
      ok: true;
      projectId: number;
    }>();
    vi.mocked(updateTicket).mockReturnValue(promise);
    onTestFinished(async () => {
      await act(async () => resolve({ ok: true, projectId: project.id }));
    });
    const bounds = mockBoardBounds('In progress');
    onTestFinished(() => bounds.mockRestore());
    renderWithTheme(
      <Board
        project={project}
        tickets={[
          ticket({ number: 4, title: 'Fix the header' }),
          ticket({ number: 7, title: 'Write the copy', status: 'In progress' }),
          ticket({
            number: 8,
            title: 'Draw the logo',
            status: 'In progress',
            position: 1,
          }),
        ]}
      />,
    );

    await dragTicketTo(4, 'In progress');

    expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
      number: 4,
      status: 'In progress',
    });
    expect(cardsIn('In progress')).toEqual([
      'Write the copy',
      'Draw the logo',
      'Fix the header',
    ]);
  });

  it("moves a Ticket dropped below its own Lane's last card to the end of it", async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(reorderTickets).mockReturnValue(promise);
    onTestFinished(async () => {
      await act(async () => resolve({ ok: true }));
    });
    const bounds = mockBoardBounds('Todo');
    onTestFinished(() => bounds.mockRestore());
    renderWithTheme(
      <Board
        project={project}
        tickets={[
          ticket({ number: 4, title: 'Fix the header' }),
          ticket({ number: 7, title: 'Write the copy', position: 1 }),
          ticket({ number: 2, title: 'Add a footer', status: 'Done' }),
        ]}
      />,
    );

    await dragTicketTo(4, 'Todo');

    expect(reorderTickets).toHaveBeenCalledExactlyOnceWith({
      projectId: project.id,
      status: 'Todo',
      ticketNumbers: [7, 4],
    });
    expect(updateTicket).not.toHaveBeenCalled();
    expect(cardsIn('Todo')).toEqual(['Write the copy', 'Fix the header']);
  });

  it('leaves a card dragged out of its Lane and back onto its own slot where it was, highlighting the Lane it is over', async () => {
    const moveLaneLeft = mockLaneBounds();
    renderWithTheme(
      <Board
        project={project}
        tickets={[
          ticket({ number: 4, title: 'Fix the header' }),
          ticket({ number: 7, title: 'Write the copy', position: 1 }),
          ticket({ number: 8, title: 'Draw the logo', status: 'In progress' }),
        ]}
      />,
    );
    await waitFor(() =>
      expect(cardOf(4)).toHaveAttribute('aria-roledescription', 'draggable'),
    );
    const heard = recordAnnouncements();

    cardOf(4).focus();
    await userEvent.keyboard('{Space}');
    await nextFrame();
    expect(highlightedLanes()).toEqual(['Todo']);
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(highlightedLanes()).toEqual(['In progress']));
    // A keyboard drag leaves the dragged card's shape where it started, so
    // its own lane moves to the left of it to be found again.
    moveLaneLeft('Todo');
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(highlightedLanes()).toEqual(['Todo']));
    await userEvent.keyboard('{Space}');

    await waitFor(() => expect(heard.at(-1)).toBe('Dropped T4 in Todo.'));
    expect(highlightedLanes()).toEqual([]);
    expect(updateTicket).not.toHaveBeenCalled();
    expect(reorderTickets).not.toHaveBeenCalled();
    expect(cardsIn('Todo')).toEqual(['Fix the header', 'Write the copy']);
    expect(cardsIn('In progress')).toEqual(['Draw the logo']);
  });

  it("moves a Ticket dropped below a filtered Lane's last card to just after that card", async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(reorderTickets).mockReturnValue(promise);
    onTestFinished(async () => {
      await act(async () => resolve({ ok: true }));
    });
    const bounds = mockBoardBounds('Todo');
    onTestFinished(() => bounds.mockRestore());
    renderWithTheme(
      <Board
        project={project}
        filter={{ query: 'ship', labels: [] }}
        tickets={[
          ticket({ number: 4, title: 'Ship the header' }),
          ticket({ number: 7, title: 'Ship the copy', position: 1 }),
          ticket({ number: 9, title: 'Draw the logo', position: 2 }),
        ]}
      />,
    );

    await dragTicketTo(4, 'Todo');

    expect(reorderTickets).toHaveBeenCalledExactlyOnceWith({
      projectId: project.id,
      status: 'Todo',
      // Before the hidden Tickets that follow it, as `mergeLaneOrder` says.
      ticketNumbers: [7, 4, 9],
    });
    expect(cardsIn('Todo')).toEqual(['Ship the copy', 'Ship the header']);
  });

  it('reorders a card dropped on another card in its Lane', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(reorderTickets).mockReturnValue(promise);
    onTestFinished(async () => {
      await act(async () => resolve({ ok: true }));
    });
    mockLaneBounds();
    renderWithTheme(
      <Board
        project={project}
        tickets={[
          ticket({ number: 4, title: 'Fix the header' }),
          ticket({ number: 7, title: 'Write the copy', position: 1 }),
          ticket({ number: 9, title: 'Draw the logo', position: 2 }),
        ]}
      />,
    );

    await keyboardDrag(cardOf(4), '{ArrowDown}');

    await waitFor(() =>
      expect(reorderTickets).toHaveBeenCalledExactlyOnceWith({
        projectId: project.id,
        status: 'Todo',
        ticketNumbers: [7, 4, 9],
      }),
    );
    expect(updateTicket).not.toHaveBeenCalled();
  });

  it('drags a card from the card itself, which has no drag handle', async () => {
    vi.mocked(updateTicket).mockResolvedValue({
      ok: true,
      projectId: project.id,
    });
    const bounds = mockBoardBounds('In progress');
    onTestFinished(() => bounds.mockRestore());
    renderWithTheme(
      <Board
        project={project}
        tickets={[ticket({ number: 4, title: 'Fix the header' })]}
      />,
    );

    expect(
      within(cardOf(4)).queryByRole('button', { name: /drag/i }),
    ).not.toBeInTheDocument();
    expect(cardOf(4)).toHaveAttribute('tabindex', '0');
    expect(cardOf(4)).toHaveAttribute('role', 'listitem');
    await dragTicketTo(4, 'In progress');

    expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
      number: 4,
      status: 'In progress',
    });
  });

  it('names the Ticket it picks up, and where a cancelled one stays, to a screen reader', async () => {
    // Every lane away from the card, so it starts over itself.
    const bounds = mockBoardBounds('Nowhere');
    onTestFinished(() => bounds.mockRestore());
    renderWithTheme(
      <Board
        project={project}
        tickets={[ticket({ number: 4, title: 'Fix the header' })]}
      />,
    );
    // dnd-kit sets up its live region with the card's role description.
    await waitFor(() =>
      expect(cardOf(4)).toHaveAttribute('aria-roledescription', 'draggable'),
    );

    cardOf(4).focus();
    await userEvent.keyboard('{Space}');
    await waitFor(() => expect(announced()).toBe('Picked up T4.'));
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(announced()).toBe('Cancelled. T4 stays in Todo.'),
    );
  });

  it('names the Ticket, and the Status it is over and dropped in, to a screen reader', async () => {
    vi.mocked(updateTicket).mockResolvedValue({
      ok: true,
      projectId: project.id,
    });
    const bounds = mockBoardBounds('In progress');
    onTestFinished(() => bounds.mockRestore());
    renderWithTheme(
      <Board
        project={project}
        tickets={[ticket({ number: 4, title: 'Fix the header' })]}
      />,
    );
    await waitFor(() =>
      expect(cardOf(4)).toHaveAttribute('aria-roledescription', 'draggable'),
    );
    const heard = recordAnnouncements();

    cardOf(4).focus();
    await userEvent.keyboard('{Space}');
    pointAtLane('In progress');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    await waitFor(() => expect(heard).toContain('T4 is over In progress.'));
    await userEvent.keyboard('{Space}');

    await waitFor(() =>
      expect(heard.at(-1)).toBe('Dropped T4 in In progress.'),
    );
  });

  it('restores the Ticket and explains when a dropped Status is refused', async () => {
    vi.mocked(updateTicket).mockResolvedValue({
      ok: false,
      error: 'There is no Ticket T4.',
    });
    const bounds = mockBoardBounds('In progress');
    onTestFinished(() => bounds.mockRestore());
    renderWithTheme(
      <Board
        project={project}
        tickets={[ticket({ number: 4, title: 'Fix the header' })]}
      />,
    );

    await dragTicketTo(4, 'In progress');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no Ticket T4.',
    );
    await waitFor(() => expect(cardsIn('Todo')).toEqual(['Fix the header']));
    expect(cardsIn('In progress')).toEqual([]);
  });

  it('moves the card to the picked column while the change saves', async () => {
    // React entangles every pending async action, so settle this one before
    // the next test or its transitions never finish.
    const { promise, resolve } = Promise.withResolvers<{
      ok: true;
      projectId: number;
    }>();
    vi.mocked(updateTicket).mockReturnValue(promise);
    const bounds = mockBoardBounds('Todo');
    onTestFinished(() => bounds.mockRestore());
    onTestFinished(async () => {
      await act(async () => resolve({ ok: true, projectId: project.id }));
    });
    renderWithTheme(
      <Board
        project={project}
        tickets={[
          ticket({ number: 4, title: 'Fix the header', status: 'Done' }),
          ticket({ number: 7, title: 'Write the copy', status: 'Done' }),
        ]}
      />,
    );

    await dragTicketTo(4, 'Todo');

    expect(cardsIn('Todo')).toEqual(['Fix the header']);
    expect(cardsIn('Done')).toEqual(['Write the copy']);
  });

  it('keeps the card in its new column once the Board has the saved Ticket', async () => {
    vi.mocked(updateTicket).mockResolvedValue({
      ok: true,
      projectId: project.id,
    });
    const { rerender } = renderWithTheme(
      <Board
        project={project}
        tickets={[ticket({ number: 4, title: 'Fix the header' })]}
      />,
    );

    const bounds = mockBoardBounds('In progress');
    onTestFinished(() => bounds.mockRestore());
    await dragTicketTo(4, 'In progress');
    rerender(
      <Board
        project={project}
        tickets={[
          ticket({ number: 4, title: 'Fix the header', status: 'In progress' }),
        ]}
      />,
    );

    expect(cardsIn('Todo')).toEqual([]);
    expect(cardsIn('In progress')).toEqual(['Fix the header']);
  });

  it('puts the card back and explains when the change is refused', async () => {
    vi.mocked(updateTicket).mockResolvedValue({
      ok: false,
      error: 'There is no Ticket T4.',
    });
    const bounds = mockBoardBounds('Done');
    onTestFinished(() => bounds.mockRestore());
    renderWithTheme(
      <Board
        project={project}
        tickets={[ticket({ number: 4, title: 'Fix the header' })]}
      />,
    );

    await dragTicketTo(4, 'Done');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no Ticket T4.',
    );
    // The alert can show one render before the optimistic move is undone.
    await waitFor(() => expect(cardsIn('Todo')).toEqual(['Fix the header']));
    expect(cardsIn('Done')).toEqual([]);
  });
});

describe('Board with Epics', () => {
  const checkout = ticket({
    number: 10,
    title: 'Checkout',
    type: 'Epic',
    children: [
      {
        number: 11,
        title: 'Pay by card',
        status: 'Todo',
        archived: false,
        blockedBy: [],
        blocked: false,
      },
    ],
  });
  const search = ticket({ number: 20, title: 'Search', type: 'Epic' });
  const payByCard = ticket({
    number: 11,
    title: 'Pay by card',
    epic: { number: 10, title: 'Checkout', color: 'teal' },
  });
  const chips = () =>
    within(screen.getByRole('list', { name: 'Epics' }))
      .queryAllByRole('link')
      .map((link) => link.textContent);

  it('leaves Epics out of the columns and their counts, keeping their children', () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={[checkout, payByCard, search]}
        epics={[checkout, search]}
      />,
    );

    expect(cardsIn('Todo')).toEqual(['Pay by card']);
    expect(
      within(screen.getByRole('region', { name: 'Todo' })).getByText(
        (_, element) => element?.textContent === '1 Ticket',
      ),
    ).toBeInTheDocument();
  });

  it("lists the Project's Epics above the columns", () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={[payByCard]}
        epics={[checkout, search]}
        cycleId={null}
      />,
    );

    expect(chips()).toEqual(['T10 Checkout 0/1 Done', 'T20 Search 0/0 Done']);
  });

  it("lists on a Cycle's Board an Epic with a child planned into it, and not one with nothing in it", () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={[payByCard]}
        epics={[checkout, search]}
        cycleId={7}
      />,
    );

    expect(chips()).toEqual(['T10 Checkout 0/1 Done']);
  });

  it("leaves out of a Cycle's row an Epic whose only planned child is archived", () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={[{ ...payByCard, archived: true }]}
        epics={[checkout, search]}
        cycleId={7}
      />,
    );

    expect(chips()).toEqual([]);
  });

  it("lists on a Cycle's Board an Epic planned into it itself", () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={[search]}
        epics={[checkout, search]}
        cycleId={7}
      />,
    );

    expect(chips()).toEqual(['T20 Search 0/0 Done']);
  });

  it("shows a Cycle's done Epics with no toggle, but hides them on the Project Board", () => {
    const done = { ...search, status: 'Done' as const };
    const { unmount } = renderWithTheme(
      <Board
        project={project}
        tickets={[done]}
        epics={[checkout, done]}
        cycleId={7}
      />,
    );

    expect(chips()).toEqual(['T20 Search 0/0 Done']);
    expect(
      screen.queryByRole('switch', { name: /Show done Epics/ }),
    ).not.toBeInTheDocument();
    unmount();
    renderWithTheme(
      <Board
        project={project}
        tickets={[]}
        epics={[checkout, done]}
        cycleId={null}
      />,
    );

    expect(chips()).toEqual(['T10 Checkout 0/1 Done']);
    expect(
      screen.getByRole('switch', { name: 'Show done Epics (1)' }),
    ).toBeInTheDocument();
  });

  it('offers to create an Epic from the row, not from the Todo lane', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 9 });
    renderWithTheme(<Board project={project} tickets={[]} cycleId={7} />);

    expect(
      screen.queryByRole('button', { name: 'Create Epic' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New Epic' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Epic title' }),
      'Checkout{Enter}',
    );

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: project.id,
      title: 'Checkout',
      cycleId: 7,
      type: 'Epic',
    });
  });
});

describe('Board with archived Tickets', () => {
  const tickets = [
    ticket({ number: 4, title: 'Fix the header' }),
    ticket({ number: 5, title: 'Old idea', archived: true }),
    ticket({ number: 6, title: 'Shipped', status: 'Done', archived: true }),
  ];
  const showArchived = () =>
    userEvent.click(screen.getByRole('switch', { name: /^Show archived/ }));
  const archivedList = () =>
    screen.queryByRole('region', { name: 'Archived Tickets' });

  it('leaves archived Tickets out of the columns', () => {
    renderWithTheme(<Board project={project} tickets={tickets} />);

    expect(cardsIn('Todo')).toEqual(['Fix the header']);
    expect(cardsIn('Done')).toEqual([]);
  });

  it('counts the archived Tickets beside the switch, zero included', () => {
    const { unmount } = renderWithTheme(
      <Board project={project} tickets={tickets} />,
    );
    expect(
      screen.getByRole('switch', { name: 'Show archived (2)' }),
    ).toBeInTheDocument();
    unmount();

    renderWithTheme(
      <Board
        project={project}
        tickets={tickets.filter((ticket) => !ticket.archived)}
      />,
    );
    expect(
      screen.getByRole('switch', { name: 'Show archived (0)' }),
    ).toBeInTheDocument();
  });

  it('hides the archived Tickets until the User asks for them', () => {
    renderWithTheme(<Board project={project} tickets={tickets} />);

    expect(
      screen.getByRole('switch', { name: 'Show archived (2)' }),
    ).not.toBeChecked();
    expect(archivedList()).not.toBeInTheDocument();
  });

  it('lists the archived Tickets below the columns, each opening its drawer', async () => {
    renderWithTheme(<Board project={project} tickets={tickets} />);

    await showArchived();

    const list = archivedList();
    expect(list).toBeInTheDocument();
    const links = within(list as HTMLElement).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Old idea',
      'Shipped',
    ]);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/project/1?ticket=5',
      '/project/1?ticket=6',
    ]);
    expect(
      within(list as HTMLElement).getByText('T5', { exact: false }),
    ).toBeInTheDocument();
  });

  it('says when the Project has no archived Tickets', async () => {
    renderWithTheme(<Board project={project} tickets={[tickets[0]]} />);

    await showArchived();

    expect(
      within(archivedList() as HTMLElement).getByText('No archived Tickets'),
    ).toBeInTheDocument();
  });

  it('starts with the archived Tickets shown when the open Ticket is archived', () => {
    renderWithTheme(
      <Board project={project} tickets={tickets} openTicket={5} />,
    );

    expect(
      screen.getByRole('switch', { name: 'Show archived (2)' }),
    ).toBeChecked();
    expect(archivedList()).toBeInTheDocument();
  });

  it('starts with the archived Tickets hidden when the open Ticket is active', () => {
    renderWithTheme(
      <Board project={project} tickets={tickets} openTicket={4} />,
    );

    expect(archivedList()).not.toBeInTheDocument();
  });

  it('hides the list again when switched off', async () => {
    renderWithTheme(<Board project={project} tickets={tickets} />);

    await showArchived();
    await showArchived();

    expect(archivedList()).not.toBeInTheDocument();
  });
});

describe('Dropping a card on an Epic', () => {
  const child = (number: number, title: string) => ({
    number,
    title,
    status: 'Todo' as const,
    archived: false,
    blockedBy: [],
    blocked: false,
  });
  const checkout = ticket({
    number: 10,
    title: 'Checkout',
    type: 'Epic',
    children: [child(11, 'Pay by card')],
  });
  const search = ticket({ number: 20, title: 'Search', type: 'Epic' });
  const payByCard = ticket({
    number: 11,
    title: 'Pay by card',
    epic: { number: 10, title: 'Checkout', color: 'teal' },
  });
  const header = ticket({ number: 4, title: 'Fix the header', position: 1 });
  const chips = () =>
    within(screen.getByRole('list', { name: 'Epics' }))
      .queryAllByRole('link')
      .map((link) => link.textContent);

  /**
   * Lays out the Board so Epic `epicNumber`'s chip is where a card dragged
   * right lands. Call it before rendering: dnd-kit measures on mount.
   */
  const mockEpicBounds = (epicNumber: number) => {
    const isChip = (element: HTMLElement) =>
      element.tagName === 'LI' &&
      element.querySelector(`a[href$="?ticket=${epicNumber}"]`) !== null &&
      !isCard(element);
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (isChip(this)) {
          return new DOMRect(60, 0, 100, 40);
        }
        if (isCard(this)) {
          return new DOMRect(0, 0, 100, 100);
        }
        // Away from the chip: the other Epics' chips and the columns, not
        // the row that holds the chip, which would clip it out of view.
        if (
          (this.tagName === 'SECTION' || this.tagName === 'LI') &&
          ![...this.querySelectorAll('li')].some(isChip)
        ) {
          return new DOMRect(500, 500, 100, 100);
        }
        return new DOMRect(0, 0, 800, 700);
      });
    onTestFinished(() => bounds.mockRestore());
  };

  /** Drags card `number` by keyboard onto Epic `epicNumber`'s chip. */
  const dragTicketOntoEpic = async (number: number, epicNumber: number) => {
    const chip = screen.getByRole('link', {
      name: new RegExp(`^T${epicNumber} `),
    });
    const elementFromPoint = Object.getOwnPropertyDescriptor(
      document,
      'elementFromPoint',
    );
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => chip,
    });
    onTestFinished(() => {
      if (elementFromPoint) {
        Object.defineProperty(document, 'elementFromPoint', elementFromPoint);
      } else {
        Reflect.deleteProperty(document, 'elementFromPoint');
      }
    });
    await keyboardDrag(cardOf(number), '{ArrowRight}');
  };

  beforeEach(() => {
    vi.mocked(moveTicketsToEpic).mockReset();
    vi.mocked(moveTickets).mockReset();
    vi.mocked(reorderTickets).mockReset();
    vi.mocked(updateTicket).mockReset();
  });

  it('attaches the Ticket to the Epic at once, leaving its Status and place alone', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(moveTicketsToEpic).mockReturnValue(promise);
    onTestFinished(async () => {
      await act(async () => resolve({ ok: true }));
    });
    mockEpicBounds(20);
    renderWithTheme(
      <Board
        project={project}
        tickets={[payByCard, header]}
        epics={[checkout, search]}
      />,
    );

    await dragTicketOntoEpic(4, 20);

    await waitFor(() => expect(announced()).toBe('Dropped T4 on Epic T20.'));

    expect(moveTicketsToEpic).toHaveBeenCalledExactlyOnceWith({
      epic: 20,
      children: [4],
    });
    expect(updateTicket).not.toHaveBeenCalled();
    expect(reorderTickets).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(chips()).toEqual(['T10 Checkout 0/1 Done', 'T20 Search 0/1 Done']),
    );
    expect(cardsIn('Todo')).toEqual(['Pay by card', 'Fix the header']);
    expect(
      screen.getByRole('link', { name: 'Epic T20 Search' }),
    ).toBeInTheDocument();
  });

  it('moves a child of another Epic to the dropped-on one', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(moveTicketsToEpic).mockReturnValue(promise);
    onTestFinished(async () => {
      await act(async () => resolve({ ok: true }));
    });
    mockEpicBounds(20);
    renderWithTheme(
      <Board
        project={project}
        tickets={[payByCard, header]}
        epics={[checkout, search]}
      />,
    );

    await dragTicketOntoEpic(11, 20);

    expect(moveTicketsToEpic).toHaveBeenCalledExactlyOnceWith({
      epic: 20,
      children: [11],
    });
    await waitFor(() =>
      expect(chips()).toEqual(['T10 Checkout 0/0 Done', 'T20 Search 0/1 Done']),
    );
  });

  it('puts the Ticket back and explains when attaching is refused', async () => {
    vi.mocked(moveTicketsToEpic).mockResolvedValue({
      ok: false,
      error: 'Epic T20 is archived. Restore it before adding Tickets to it.',
    });
    mockEpicBounds(20);
    renderWithTheme(
      <Board
        project={project}
        tickets={[payByCard, header]}
        epics={[checkout, search]}
      />,
    );

    await dragTicketOntoEpic(4, 20);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Epic T20 is archived. Restore it before adding Tickets to it.',
    );
    await waitFor(() =>
      expect(chips()).toEqual(['T10 Checkout 0/1 Done', 'T20 Search 0/0 Done']),
    );
  });

  it('attaches every selected Ticket at once, in Board order, moving them from their Epics', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(moveTicketsToEpic).mockReturnValue(promise);
    onTestFinished(async () => {
      await act(async () => resolve({ ok: true }));
    });
    mockEpicBounds(20);
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={[payByCard, header]}
        epics={[checkout, search]}
      />,
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Select T4 Fix the header' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Select T11 Pay by card' }),
    );

    const heard = recordAnnouncements();

    await dragTicketOntoEpic(4, 20);

    await waitFor(() =>
      expect(heard.at(-1)).toBe('Dropped 2 Tickets on Epic T20.'),
    );
    expect(moveTicketsToEpic).toHaveBeenCalledExactlyOnceWith({
      epic: 20,
      children: [11, 4],
    });
    expect(moveTickets).not.toHaveBeenCalled();
    expect(updateTicket).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(chips()).toEqual(['T10 Checkout 0/0 Done', 'T20 Search 0/2 Done']),
    );
    expect(cardsIn('Todo')).toEqual(['Pay by card', 'Fix the header']);
    expect(
      screen.getAllByRole('link', { name: 'Epic T20 Search' }),
    ).toHaveLength(2);
  });

  it('attaches only an unselected card dropped while others are selected', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(moveTicketsToEpic).mockReturnValue(promise);
    onTestFinished(async () => {
      await act(async () => resolve({ ok: true }));
    });
    mockEpicBounds(20);
    const user = userEvent.setup();
    const footer = ticket({ number: 5, title: 'Fix the footer', position: 2 });
    renderWithTheme(
      <Board
        project={project}
        tickets={[payByCard, header, footer]}
        epics={[checkout, search]}
      />,
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Select T11 Pay by card' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Select T5 Fix the footer' }),
    );

    await dragTicketOntoEpic(4, 20);

    expect(moveTicketsToEpic).toHaveBeenCalledExactlyOnceWith({
      epic: 20,
      children: [4],
    });
  });

  it('puts the selected Tickets back and explains when attaching them is refused', async () => {
    vi.mocked(moveTicketsToEpic).mockResolvedValue({
      ok: false,
      error: 'Epic T20 is archived. Restore it before adding Tickets to it.',
    });
    mockEpicBounds(20);
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={[payByCard, header]}
        epics={[checkout, search]}
      />,
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Select T4 Fix the header' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Select T11 Pay by card' }),
    );

    await dragTicketOntoEpic(11, 20);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Epic T20 is archived. Restore it before adding Tickets to it.',
    );
    await waitFor(() =>
      expect(chips()).toEqual(['T10 Checkout 0/1 Done', 'T20 Search 0/0 Done']),
    );
    expect(
      screen.queryByRole('link', { name: 'Epic T20 Search' }),
    ).not.toBeInTheDocument();
  });
});

describe('Selecting cards', () => {
  const header = ticket({ number: 4, title: 'Fix the header', position: 0 });
  const copy = ticket({ number: 7, title: 'Write the copy', position: 1 });
  const logo = ticket({ number: 9, title: 'Draw the logo', position: 2 });
  const footer = ticket({ number: 12, title: 'Fix the footer', position: 3 });
  const deploy = ticket({
    number: 15,
    title: 'Deploy',
    status: 'In progress',
  });
  const board = [header, copy, logo, footer, deploy];

  const cardLink = (title: string) => screen.getByRole('link', { name: title });
  const checkbox = (number: number, title: string) =>
    screen.getByRole('checkbox', { name: `Select T${number} ${title}` });
  const selectedTitles = () =>
    screen
      .queryAllByRole('checkbox', { name: /^Select T/, checked: true })
      .map((box) => box.getAttribute('aria-label'));
  const selectionBar = () =>
    screen.queryByRole('toolbar', { name: 'Selection' });

  /** Clicks `title`'s card while holding `key`. */
  const clickWith = async (
    user: ReturnType<typeof userEvent.setup>,
    key: 'Meta' | 'Control' | 'Shift',
    title: string,
  ) => {
    await user.keyboard(`{${key}>}`);
    await user.click(cardLink(title));
    await user.keyboard(`{/${key}}`);
  };

  beforeEach(() => {
    vi.mocked(archiveTickets).mockReset();
    vi.mocked(moveTickets).mockReset();
    vi.mocked(reorderTickets).mockReset();
    vi.mocked(updateTicket).mockReset();
  });

  it('adds a card with Cmd-click or Ctrl-click and takes it out again', async () => {
    const user = userEvent.setup();
    renderWithTheme(<Board project={project} tickets={board} />);

    expect(selectionBar()).not.toBeInTheDocument();

    await clickWith(user, 'Meta', 'Fix the header');
    await clickWith(user, 'Control', 'Draw the logo');

    expect(selectedTitles()).toEqual([
      'Select T4 Fix the header',
      'Select T9 Draw the logo',
    ]);
    expect(selectionBar()).toHaveTextContent('2 selected');

    await clickWith(user, 'Meta', 'Fix the header');

    expect(selectedTitles()).toEqual(['Select T9 Draw the logo']);
    expect(selectionBar()).toHaveTextContent('1 selected');
  });

  it('selects the range in its column from the last card clicked with Shift-click', async () => {
    const user = userEvent.setup();
    renderWithTheme(<Board project={project} tickets={board} />);

    await clickWith(user, 'Meta', 'Write the copy');
    await clickWith(user, 'Shift', 'Fix the footer');

    expect(selectedTitles()).toEqual([
      'Select T7 Write the copy',
      'Select T9 Draw the logo',
      'Select T12 Fix the footer',
    ]);
  });

  it('only adds a card Shift-clicked in another column', async () => {
    const user = userEvent.setup();
    renderWithTheme(<Board project={project} tickets={board} />);

    await clickWith(user, 'Meta', 'Fix the header');
    await clickWith(user, 'Shift', 'Deploy');

    expect(selectedTitles()).toEqual([
      'Select T4 Fix the header',
      'Select T15 Deploy',
    ]);
  });

  it("selects with each card's checkbox, by pointer or by keyboard", async () => {
    const user = userEvent.setup();
    renderWithTheme(<Board project={project} tickets={board} />);

    await user.click(checkbox(4, 'Fix the header'));
    checkbox(7, 'Write the copy').focus();
    await user.keyboard(' ');

    expect(selectedTitles()).toEqual([
      'Select T4 Fix the header',
      'Select T7 Write the copy',
    ]);

    await user.keyboard(' ');

    expect(selectedTitles()).toEqual(['Select T4 Fix the header']);
  });

  it('offers no checkbox on archived Tickets', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={[
          header,
          ticket({ number: 5, title: 'Old idea', archived: true }),
        ]}
      />,
    );

    await user.click(screen.getByRole('switch', { name: /Show archived/ }));

    expect(
      screen.queryByRole('checkbox', { name: /^Select T5/ }),
    ).not.toBeInTheDocument();
  });

  it('empties the selection with Clear, Escape or a click on empty Board space', async () => {
    const user = userEvent.setup();
    renderWithTheme(<Board project={project} tickets={board} />);
    const select = () => user.click(checkbox(4, 'Fix the header'));

    await select();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(selectedTitles()).toEqual([]);
    expect(selectionBar()).not.toBeInTheDocument();

    await select();
    await user.keyboard('{Escape}');
    expect(selectedTitles()).toEqual([]);

    await select();
    await user.click(screen.getByRole('region', { name: 'Done' }));
    expect(selectedTitles()).toEqual([]);
  });

  it('keeps the selection through live updates, dropping a Ticket that left the Board', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithTheme(
      <Board project={project} tickets={board} />,
    );
    await user.click(checkbox(4, 'Fix the header'));
    await user.click(checkbox(7, 'Write the copy'));

    rerender(
      <Board
        project={project}
        tickets={[
          { ...header, title: 'Fix the page header' },
          { ...copy, archived: true },
          logo,
        ]}
      />,
    );

    expect(selectedTitles()).toEqual(['Select T4 Fix the page header']);
    expect(selectionBar()).toHaveTextContent('1 selected');
  });

  it('leaves a Ticket that left the Board unselected when it comes back', async () => {
    const user = userEvent.setup();
    const { rerender } = renderWithTheme(
      <Board project={project} tickets={board} />,
    );
    await user.click(checkbox(7, 'Write the copy'));

    rerender(
      <Board
        project={project}
        tickets={[header, { ...copy, archived: true }]}
      />,
    );
    rerender(<Board project={project} tickets={board} />);

    expect(selectedTitles()).toEqual([]);
    expect(selectionBar()).not.toBeInTheDocument();
  });

  it('leaves a selection dragged out of its Lane and back onto its own slot where it was', async () => {
    const moveLaneLeft = mockLaneBounds();
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={[
          ticket({ number: 4, title: 'Fix the header' }),
          ticket({ number: 7, title: 'Write the copy', position: 1 }),
          ticket({ number: 8, title: 'Draw the logo', status: 'In progress' }),
        ]}
      />,
    );
    await user.click(checkbox(4, 'Fix the header'));
    await user.click(checkbox(7, 'Write the copy'));
    const heard = recordAnnouncements();

    cardOf(4).focus();
    await userEvent.keyboard('{Space}');
    await nextFrame();
    await userEvent.keyboard('{ArrowRight}');
    await waitFor(() => expect(highlightedLanes()).toEqual(['In progress']));
    moveLaneLeft('Todo');
    await userEvent.keyboard('{ArrowLeft}');
    await waitFor(() => expect(highlightedLanes()).toEqual(['Todo']));
    await userEvent.keyboard('{Space}');

    await waitFor(() =>
      expect(heard.at(-1)).toBe('Dropped 2 Tickets in Todo.'),
    );
    expect(moveTickets).not.toHaveBeenCalled();
    expect(cardsIn('Todo')).toEqual(['Fix the header', 'Write the copy']);
    expect(cardsIn('In progress')).toEqual(['Draw the logo']);
  });

  it('drags the whole selection to a column, in Board order, and saves it as one move', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(moveTickets).mockReturnValue(promise);
    onTestFinished(async () => {
      await act(async () => resolve({ ok: true }));
    });
    // Dropping into a column that holds cards trips jsdom over dnd-kit's own
    // DOM moves, so this drops into the empty Done column; where a selection
    // lands among cards is covered in `selection-drop.test.ts`.
    const bounds = mockBoardBounds('Done');
    onTestFinished(() => bounds.mockRestore());
    const user = userEvent.setup();
    renderWithTheme(<Board project={project} tickets={board} />);
    await user.click(checkbox(9, 'Draw the logo'));
    await user.click(checkbox(15, 'Deploy'));
    await user.click(checkbox(4, 'Fix the header'));
    const heard = recordAnnouncements();

    await dragTicketTo(9, 'Done');

    await waitFor(() =>
      expect(heard.at(-1)).toBe('Dropped 3 Tickets in Done.'),
    );
    expect(heard).toContain('3 Tickets are over Done.');
    expect(moveTickets).toHaveBeenCalledExactlyOnceWith({
      projectId: project.id,
      ticketNumbers: [4, 9, 15],
      status: 'Done',
      before: null,
    });
    expect(updateTicket).not.toHaveBeenCalled();
    expect(cardsIn('Todo')).toEqual(['Write the copy', 'Fix the footer']);
    expect(cardsIn('In progress')).toEqual([]);
    expect(cardsIn('Done')).toEqual([
      'Fix the header',
      'Draw the logo',
      'Deploy',
    ]);
    expect(selectedTitles()).toEqual([
      'Select T4 Fix the header',
      'Select T9 Draw the logo',
      'Select T15 Deploy',
    ]);
  });

  it('shows how many Tickets a dragged selection carries, and dims the rest of it until the drop', async () => {
    const bounds = mockBoardBounds('Nowhere');
    onTestFinished(() => bounds.mockRestore());
    const user = userEvent.setup();
    renderWithTheme(<Board project={project} tickets={board} />);
    await user.click(checkbox(4, 'Fix the header'));
    await user.click(checkbox(9, 'Draw the logo'));
    await user.click(checkbox(15, 'Deploy'));
    await waitFor(() =>
      expect(cardOf(9)).toHaveAttribute('aria-roledescription', 'draggable'),
    );
    const carriedAlong = () =>
      // A dragged card leaves a copy of itself in its place, so T9 is left out.
      [4, 7, 12, 15].filter((number) =>
        cardOf(number).hasAttribute('data-carried-along'),
      );

    expect(screen.queryByText('3 Tickets')).not.toBeInTheDocument();
    expect(carriedAlong()).toEqual([]);

    cardOf(9).focus();
    await user.keyboard('{Space}');

    await waitFor(() => expect(announced()).toBe('Picked up 3 Tickets.'));
    expect(screen.getByText('3 Tickets').closest('li')).toHaveTextContent(
      /^T9/,
    );
    expect(carriedAlong()).toEqual([4, 15]);

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(announced()).toBe(
        'Cancelled. The 3 Tickets stay where they were.',
      ),
    );
    expect(screen.queryByText('3 Tickets')).not.toBeInTheDocument();
    expect(carriedAlong()).toEqual([]);
  });

  it('carries only an unselected card picked up while others are selected, keeping the selection', async () => {
    const bounds = mockBoardBounds('Nowhere');
    onTestFinished(() => bounds.mockRestore());
    const user = userEvent.setup();
    renderWithTheme(<Board project={project} tickets={board} />);
    await user.click(checkbox(4, 'Fix the header'));
    await user.click(checkbox(9, 'Draw the logo'));
    await waitFor(() =>
      expect(cardOf(7)).toHaveAttribute('aria-roledescription', 'draggable'),
    );

    cardOf(7).focus();
    await user.keyboard('{Space}');

    await waitFor(() => expect(announced()).toBe('Picked up T7.'));
    expect(screen.queryByText(/^\d+ Tickets$/)).not.toBeInTheDocument();
    expect(cardOf(4)).not.toHaveAttribute('data-carried-along');
    expect(cardOf(9)).not.toHaveAttribute('data-carried-along');

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(announced()).toBe('Cancelled. T7 stays in Todo.'),
    );
    expect(selectedTitles()).toEqual([
      'Select T4 Fix the header',
      'Select T9 Draw the logo',
    ]);
  });

  it('puts the cards back and explains when the move is refused', async () => {
    vi.mocked(moveTickets).mockResolvedValue({
      ok: false,
      error: 'Ticket T9 is archived. Restore it before moving it.',
    });
    const bounds = mockBoardBounds('Done');
    onTestFinished(() => bounds.mockRestore());
    const user = userEvent.setup();
    renderWithTheme(<Board project={project} tickets={board} />);
    await user.click(checkbox(4, 'Fix the header'));
    await user.click(checkbox(9, 'Draw the logo'));

    await dragTicketTo(4, 'Done');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ticket T9 is archived. Restore it before moving it.',
    );
    await waitFor(() =>
      expect(cardsIn('Todo')).toEqual([
        'Fix the header',
        'Write the copy',
        'Draw the logo',
        'Fix the footer',
      ]),
    );
    expect(cardsIn('Done')).toEqual([]);
  });

  it('archives the whole selection at once, in Board order, without asking', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(archiveTickets).mockReturnValue(promise);
    const user = userEvent.setup();
    const { rerender } = renderWithTheme(
      <Board project={project} tickets={board} />,
    );
    await user.click(checkbox(15, 'Deploy'));
    await user.click(checkbox(9, 'Draw the logo'));

    await user.click(
      within(selectionBar() as HTMLElement).getByRole('button', {
        name: 'Archive',
      }),
    );

    expect(archiveTickets).toHaveBeenCalledExactlyOnceWith({
      ticketNumbers: [9, 15],
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(cardsIn('Todo')).toEqual([
      'Fix the header',
      'Write the copy',
      'Fix the footer',
    ]);
    expect(cardsIn('In progress')).toEqual([]);
    expect(screen.getByText('Show archived (2)')).toBeInTheDocument();
    expect(selectionBar()).not.toBeInTheDocument();

    await act(async () => resolve({ ok: true }));
    const archived = [
      { ...logo, archived: true },
      { ...deploy, archived: true },
    ];
    rerender(
      <Board project={project} tickets={[header, copy, footer, ...archived]} />,
    );
    // Restored later, they are no longer selected.
    rerender(<Board project={project} tickets={board} />);

    expect(selectedTitles()).toEqual([]);
    expect(selectionBar()).not.toBeInTheDocument();
  });

  it('puts the cards back, still selected, and explains when archiving is refused', async () => {
    vi.mocked(archiveTickets).mockResolvedValue({
      ok: false,
      error:
        'Ticket T9 is in the archived Project "Website". Restore the Project before changing its Tickets.',
    });
    const user = userEvent.setup();
    renderWithTheme(<Board project={project} tickets={board} />);
    await user.click(checkbox(4, 'Fix the header'));
    await user.click(checkbox(9, 'Draw the logo'));

    await user.click(screen.getByRole('button', { name: 'Archive' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ticket T9 is in the archived Project "Website".',
    );
    await waitFor(() =>
      expect(cardsIn('Todo')).toEqual([
        'Fix the header',
        'Write the copy',
        'Draw the logo',
        'Fix the footer',
      ]),
    );
    expect(screen.getByText('Show archived (0)')).toBeInTheDocument();
    expect(selectedTitles()).toEqual([
      'Select T4 Fix the header',
      'Select T9 Draw the logo',
    ]);
    expect(selectionBar()).toHaveTextContent('2 selected');
  });

  it('drags an unselected card on its own', async () => {
    vi.mocked(updateTicket).mockResolvedValue({
      ok: true,
      projectId: project.id,
    });
    const bounds = mockBoardBounds('Done');
    onTestFinished(() => bounds.mockRestore());
    const user = userEvent.setup();
    renderWithTheme(<Board project={project} tickets={board} />);
    await user.click(checkbox(4, 'Fix the header'));

    await dragTicketTo(7, 'Done');

    expect(moveTickets).not.toHaveBeenCalled();
    expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
      number: 7,
      status: 'Done',
    });
  });
});

describe('Planning a selection into a Cycle', () => {
  showOpenPopovers();

  const header = ticket({ number: 4, title: 'Fix the header', position: 0 });
  const copy = ticket({ number: 7, title: 'Write the copy', position: 1 });
  const deploy = ticket({
    number: 15,
    title: 'Deploy',
    status: 'In progress',
  });
  const board = [header, copy, deploy];

  const cycle = (
    fields: Pick<Cycle, 'id' | 'title' | 'state'> & Partial<Cycle>,
  ): Cycle => ({
    projectId: project.id,
    ticketNumbers: [],
    createdAt: new Date('2026-01-01'),
    archivedAt: null,
    ...fields,
  });
  const launch = cycle({ id: 2, title: 'Launch', state: 'Active' });
  const beta = cycle({ id: 3, title: 'Beta', state: 'Prepared' });
  const alpha = cycle({ id: 1, title: 'Alpha', state: 'Archived' });
  const cycles = [alpha, launch, beta];

  const checkbox = (number: number, title: string) =>
    screen.getByRole('checkbox', { name: `Select T${number} ${title}` });
  const selectedTitles = () =>
    screen
      .queryAllByRole('checkbox', { name: /^Select T/, checked: true })
      .map((box) => box.getAttribute('aria-label'));
  const selectionBar = () =>
    screen.queryByRole('toolbar', { name: 'Selection' });

  /** Selects `deploy` and `header`, in that order. */
  const selectTwo = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(checkbox(15, 'Deploy'));
    await user.click(checkbox(4, 'Fix the header'));
  };

  beforeEach(() => {
    vi.mocked(moveTicketsToCycle).mockReset();
  });

  it("lists the Project's Prepared and Active Cycles in the bar's menu", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        cycles={cycles}
        cycleId={null}
      />,
    );
    await selectTwo(user);

    await user.click(screen.getByRole('button', { name: 'Move to Cycle' }));

    const menu = screen.getByRole('dialog', { name: 'Move to Cycle' });
    expect(
      within(menu)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Launch', 'Beta']);
  });

  it('plans the whole selection into the chosen Cycle, in Board order', async () => {
    vi.mocked(moveTicketsToCycle).mockResolvedValue({ ok: true, failed: [] });
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        cycles={cycles}
        cycleId={null}
      />,
    );
    await selectTwo(user);

    await user.click(screen.getByRole('button', { name: 'Move to Cycle' }));
    await user.click(screen.getByRole('button', { name: 'Beta' }));

    expect(moveTicketsToCycle).toHaveBeenCalledExactlyOnceWith({
      projectId: project.id,
      cycleId: beta.id,
      ticketNumbers: [4, 15],
    });
    await waitFor(() => expect(selectionBar()).not.toBeInTheDocument());
    expect(selectedTitles()).toEqual([]);
  });

  it('keeps the refused Tickets selected and lists why each was refused', async () => {
    const refusal =
      'Ticket T15 is already planned into the Cycle "Launch". Remove it from that Cycle first.';
    vi.mocked(moveTicketsToCycle).mockResolvedValue({
      ok: true,
      failed: [{ number: 15, error: refusal }],
    });
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        cycles={cycles}
        cycleId={null}
      />,
    );
    await user.click(checkbox(7, 'Write the copy'));
    await selectTwo(user);

    await user.click(screen.getByRole('button', { name: 'Move to Cycle' }));
    await user.click(screen.getByRole('button', { name: 'Beta' }));

    const refusals = await screen.findByRole('list', { name: 'Not moved' });
    expect(
      within(refusals)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([refusal]);
    expect(selectedTitles()).toEqual(['Select T15 Deploy']);
    expect(selectionBar()).toHaveTextContent('1 selected');

    // Not a click on empty Board space.
    await user.click(within(refusals).getByText(refusal));

    expect(selectedTitles()).toEqual(['Select T15 Deploy']);

    await user.click(checkbox(7, 'Write the copy'));

    expect(
      screen.queryByRole('list', { name: 'Not moved' }),
    ).not.toBeInTheDocument();
  });

  it('keeps a card picked while the plan saves selected', async () => {
    const { promise, resolve } = Promise.withResolvers<{
      ok: true;
      failed: [];
    }>();
    vi.mocked(moveTicketsToCycle).mockReturnValue(promise);
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        cycles={cycles}
        cycleId={null}
      />,
    );
    await selectTwo(user);
    await user.click(screen.getByRole('button', { name: 'Move to Cycle' }));
    await user.click(screen.getByRole('button', { name: 'Beta' }));

    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();

    await user.click(checkbox(7, 'Write the copy'));
    await act(async () => resolve({ ok: true, failed: [] }));

    expect(selectedTitles()).toEqual(['Select T7 Write the copy']);
  });

  it('keeps the selection and explains when the whole batch is refused', async () => {
    vi.mocked(moveTicketsToCycle).mockResolvedValue({
      ok: false,
      error: 'The Cycle "Beta" is Archived and can no longer change.',
    });
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        cycles={cycles}
        cycleId={null}
      />,
    );
    await selectTwo(user);

    await user.click(screen.getByRole('button', { name: 'Move to Cycle' }));
    await user.click(screen.getByRole('button', { name: 'Beta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Cycle "Beta" is Archived and can no longer change.',
    );
    expect(selectedTitles()).toEqual([
      'Select T4 Fix the header',
      'Select T15 Deploy',
    ]);
  });

  it("on a Cycle's Board offers the other open Cycles, then the Backlog", async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        cycles={cycles}
        cycleId={beta.id}
      />,
    );
    await selectTwo(user);

    await user.click(screen.getByRole('button', { name: 'Move to Cycle' }));

    const menu = screen.getByRole('dialog', { name: 'Move to Cycle' });
    expect(
      within(menu)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Launch', 'Backlog']);
  });

  it("moves the selection to the Backlog from a Cycle's Board", async () => {
    vi.mocked(moveTicketsToCycle).mockResolvedValue({ ok: true, failed: [] });
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        cycles={[launch]}
        cycleId={launch.id}
      />,
    );
    await selectTwo(user);

    await user.click(screen.getByRole('button', { name: 'Move to Cycle' }));
    await user.click(screen.getByRole('button', { name: 'Backlog' }));

    expect(moveTicketsToCycle).toHaveBeenCalledExactlyOnceWith({
      projectId: project.id,
      cycleId: null,
      ticketNumbers: [4, 15],
    });
    await waitFor(() => expect(selectionBar()).not.toBeInTheDocument());
  });

  it('offers no menu on the Backlog without a Cycle to move to', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        cycles={[alpha]}
        cycleId={null}
      />,
    );
    await selectTwo(user);

    expect(selectionBar()).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Move to Cycle' }),
    ).not.toBeInTheDocument();
  });
});

describe('Filtering the Board', () => {
  const header = ticket({
    number: 4,
    title: 'Fix the header',
    labels: ['bug', 'ui'],
    position: 0,
  });
  const copy = ticket({
    number: 7,
    title: 'Write the copy',
    labels: ['docs'],
    position: 1,
  });
  const footer = ticket({
    number: 12,
    title: 'Fix the footer',
    labels: ['bug'],
    position: 2,
  });
  const deploy = ticket({
    number: 42,
    title: 'Deploy',
    status: 'In progress',
  });
  const oldLogo = ticket({
    number: 3,
    title: 'Fix the old logo',
    labels: ['legacy'],
    archived: true,
  });
  const board = [header, copy, footer, deploy, oldLogo];

  const search = () =>
    screen.getByRole('searchbox', { name: 'Search Tickets' });
  const labelPicker = () =>
    screen.getByRole('combobox', { name: 'Filter by Label' });
  const offeredLabels = () =>
    within(labelPicker())
      .getAllByRole('option')
      .slice(1)
      .map((option) => option.textContent);
  const chosenLabels = () =>
    within(screen.getByRole('list', { name: 'Chosen Labels' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
  const replaceState = () => {
    const spy = vi.spyOn(window.history, 'replaceState');
    onTestFinished(() => spy.mockRestore());
    return spy;
  };
  const checkbox = (number: number, title: string) =>
    screen.getByRole('checkbox', { name: `Select T${number} ${title}` });
  const selectedTitles = () =>
    screen
      .queryAllByRole('checkbox', { name: /^Select T/, checked: true })
      .map((box) => box.getAttribute('aria-label'));

  beforeEach(() => {
    vi.mocked(createTicket).mockReset();
  });

  it('shows only Tickets whose title contains the search, trimmed and ignoring case', async () => {
    renderWithTheme(<Board project={project} tickets={board} />);

    await userEvent.type(search(), '  FIX THE ');

    expect(cardsIn('Todo')).toEqual(['Fix the header', 'Fix the footer']);
    expect(cardsIn('In progress')).toEqual([]);
  });

  it.each(['T42', '42'])(
    'finds a Ticket by its number, as %s',
    async (text) => {
      renderWithTheme(<Board project={project} tickets={board} />);

      await userEvent.type(search(), text);

      expect(cardsIn('Todo')).toEqual([]);
      expect(cardsIn('In progress')).toEqual(['Deploy']);
    },
  );

  it("offers only the Labels on the Board's Tickets, archived ones and Epics included", () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        epics={[
          ticket({
            number: 30,
            title: 'Checkout',
            type: 'Epic',
            labels: ['payments'],
          }),
        ]}
      />,
    );

    expect(offeredLabels()).toEqual([
      'bug',
      'docs',
      'legacy',
      'payments',
      'ui',
    ]);
  });

  it('shows only Tickets with every Label picked, and lists them as chosen in the order picked', async () => {
    renderWithTheme(<Board project={project} tickets={board} />);

    await userEvent.selectOptions(labelPicker(), 'ui');
    await userEvent.selectOptions(labelPicker(), 'bug');

    expect(cardsIn('Todo')).toEqual(['Fix the header']);
    expect(chosenLabels()).toEqual(['ui', 'bug']);
    expect(offeredLabels()).toEqual(['docs', 'legacy']);
  });

  it('keeps a chosen Label no Ticket has listed, so it can be removed', async () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        filter={{ query: '', labels: ['gone'] }}
      />,
    );

    expect(chosenLabels()).toEqual(['gone']);
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove label gone' }),
    );

    expect(cardsIn('Todo')).toEqual([
      'Fix the header',
      'Write the copy',
      'Fix the footer',
    ]);
  });

  it('starts with the filter from the URL', () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        filter={{ query: 'fix', labels: ['bug'] }}
      />,
    );

    expect(search()).toHaveValue('fix');
    expect(cardsIn('Todo')).toEqual(['Fix the header', 'Fix the footer']);
  });

  it('puts the search in the URL after a pause, replacing the history entry', async () => {
    const replace = replaceState();
    renderWithTheme(<Board project={project} tickets={board} cycleId={7} />);

    await userEvent.type(search(), 'fix header');

    expect(replace).not.toHaveBeenCalledWith(
      null,
      '',
      '/project/1/cycle/7?q=fix+h',
    );
    await waitFor(() =>
      expect(replace).toHaveBeenLastCalledWith(
        null,
        '',
        '/project/1/cycle/7?q=fix+header',
      ),
    );
  });

  it('puts picked Labels in the URL at once, and leaves a blank search out', async () => {
    const replace = replaceState();
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        filter={{ query: ' ', labels: ['bug'] }}
      />,
    );

    await userEvent.selectOptions(labelPicker(), 'ui');

    expect(replace).toHaveBeenLastCalledWith(
      null,
      '',
      '/project/1?label=bug&label=ui',
    );
  });

  it("opens a card's, an Epic's and an archived Ticket's drawer keeping the filter", async () => {
    const epic = ticket({ number: 30, title: 'Fix it all', type: 'Epic' });
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        epics={[epic]}
        filter={{ query: 'fix', labels: [] }}
      />,
    );
    await userEvent.click(
      screen.getByRole('switch', { name: /Show archived/ }),
    );

    expect(
      screen.getByRole('link', { name: 'Fix the header' }),
    ).toHaveAttribute('href', '/project/1?q=fix&ticket=4');
    expect(
      screen.getByRole('link', { name: /T30 Fix it all/ }),
    ).toHaveAttribute('href', '/project/1?q=fix&ticket=30');
    expect(
      screen.getByRole('link', { name: 'Fix the old logo' }),
    ).toHaveAttribute('href', '/project/1?q=fix&ticket=3');
  });

  it('filters the archived Tickets, and counts only the matching ones', async () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={[
          ...board,
          ticket({ number: 5, title: 'Old copy', archived: true }),
        ]}
        filter={{ query: 'fix', labels: [] }}
      />,
    );

    const toggle = screen.getByRole('switch', { name: 'Show archived (1)' });
    await userEvent.click(toggle);

    const archived = within(
      screen.getByRole('region', { name: 'Archived Tickets' }),
    );
    expect(archived.getByText('Fix the old logo')).toBeInTheDocument();
    expect(archived.queryByText('Old copy')).not.toBeInTheDocument();
  });

  it('counts only the matching Tickets in each column', () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        filter={{ query: 'fix', labels: [] }}
      />,
    );

    expect(
      within(screen.getByRole('region', { name: 'Todo' })).getByText(
        (_, element) => element?.textContent === '2 Tickets',
      ),
    ).toBeInTheDocument();
  });

  describe('with Epics', () => {
    const child = (
      fields: Pick<Ticket, 'number' | 'title'>,
    ): Ticket['children'][number] => ({
      ...fields,
      status: 'Todo',
      archived: false,
      blockedBy: [],
      blocked: false,
    });
    const checkout = ticket({
      number: 10,
      title: 'Checkout',
      type: 'Epic',
      children: [
        { ...child({ number: 11, title: 'Pay by card' }), status: 'Done' },
        child({ number: 13, title: 'Pay by invoice' }),
      ],
    });
    const searchEpic = ticket({ number: 20, title: 'Search', type: 'Epic' });
    const payByCard = ticket({
      number: 11,
      title: 'Pay by card',
      status: 'Done',
      labels: ['bug'],
      epic: { number: 10, title: 'Checkout', color: 'teal' },
    });
    const payByInvoice = ticket({
      number: 13,
      title: 'Pay by invoice',
      epic: { number: 10, title: 'Checkout', color: 'teal' },
    });
    const tickets = [checkout, searchEpic, payByCard, payByInvoice];
    const epics = [checkout, searchEpic];
    const chips = () =>
      within(screen.getByRole('list', { name: 'Epics' }))
        .queryAllByRole('link')
        .map((link) => link.textContent);

    it('keeps an Epic whose child matches, counting all its children', () => {
      renderWithTheme(
        <Board
          project={project}
          tickets={tickets}
          epics={epics}
          filter={{ query: '', labels: ['bug'] }}
        />,
      );

      expect(chips()).toEqual(['T10 Checkout 1/2 Done']);
      expect(cardsIn('Todo')).toEqual([]);
      expect(cardsIn('Done')).toEqual(['Pay by card']);
    });

    it('keeps an Epic that matches itself, its unmatched children hidden', () => {
      renderWithTheme(
        <Board
          project={project}
          tickets={tickets}
          epics={epics}
          filter={{ query: 'search', labels: [] }}
        />,
      );

      expect(chips()).toEqual(['T20 Search 0/0 Done']);
      expect(cardsIn('Todo')).toEqual([]);
      expect(cardsIn('Done')).toEqual([]);
    });
  });

  it('drops Tickets the filter hides from the selection', async () => {
    const user = userEvent.setup();
    renderWithTheme(<Board project={project} tickets={board} />);
    await user.click(checkbox(4, 'Fix the header'));
    await user.click(checkbox(7, 'Write the copy'));

    await user.type(search(), 'fix');
    await user.clear(search());

    expect(selectedTitles()).toEqual(['Select T4 Fix the header']);
  });

  it('selects only shown cards in a Shift-click range', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        filter={{ query: 'fix', labels: [] }}
      />,
    );

    await user.click(checkbox(4, 'Fix the header'));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('link', { name: 'Fix the footer' }));
    await user.keyboard('{/Shift}');
    await user.clear(search());

    expect(selectedTitles()).toEqual([
      'Select T4 Fix the header',
      'Select T12 Fix the footer',
    ]);
  });

  it('says when no Ticket matches, and clears the filter', async () => {
    const replace = replaceState();
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        filter={{ query: 'nothing', labels: ['bug'] }}
      />,
    );

    expect(screen.getByText('No Tickets match')).toBeInTheDocument();
    const clears = screen.getAllByRole('button', { name: 'Clear filter' });
    await userEvent.click(clears[clears.length - 1]);

    expect(screen.queryByText('No Tickets match')).not.toBeInTheDocument();
    expect(search()).toHaveValue('');
    expect(cardsIn('Todo')).toHaveLength(3);
    expect(replace).toHaveBeenLastCalledWith(null, '', '/project/1');
  });

  it('offers Clear filter beside the controls only while a filter is active', async () => {
    renderWithTheme(<Board project={project} tickets={board} />);

    expect(
      screen.queryByRole('button', { name: 'Clear filter' }),
    ).not.toBeInTheDocument();
    await userEvent.type(search(), 'fix');

    expect(
      screen.getByRole('button', { name: 'Clear filter' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No Tickets match')).not.toBeInTheDocument();
  });

  it('drops a Ticket edited out of the filter at once, without a notice', () => {
    const filter = { query: 'fix', labels: [] };
    const { rerender } = renderWithTheme(
      <Board project={project} tickets={board} filter={filter} />,
    );

    rerender(
      <Board
        project={project}
        tickets={[{ ...header, title: 'Tidy the header' }, copy, footer]}
        filter={filter}
      />,
    );

    expect(cardsIn('Todo')).toEqual(['Fix the footer']);
    expect(screen.queryByText(/hidden by the filter/)).not.toBeInTheDocument();
  });

  it('says briefly when a Ticket added inline is hidden by the filter', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 80 });
    const filter = { query: 'fix', labels: [] };
    const { rerender } = renderWithTheme(
      <Board project={project} tickets={board} filter={filter} />,
    );

    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Ticket title' }),
      'Write the footer{Enter}',
    );
    rerender(
      <Board
        project={project}
        tickets={[...board, ticket({ number: 80, title: 'Write the footer' })]}
        filter={filter}
      />,
    );

    expect(
      await screen.findByText('T80 created, hidden by the filter'),
    ).toHaveAttribute('role', 'status');
  });

  it('says nothing when a Ticket added inline matches the filter', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 80 });
    const filter = { query: 'fix', labels: [] };
    const { rerender } = renderWithTheme(
      <Board project={project} tickets={board} filter={filter} />,
    );

    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Ticket title' }),
      'Fix the logo{Enter}',
    );
    rerender(
      <Board
        project={project}
        tickets={[...board, ticket({ number: 80, title: 'Fix the logo' })]}
        filter={filter}
      />,
    );

    expect(cardsIn('Todo')).toContain('Fix the logo');
    expect(screen.queryByText(/hidden by the filter/)).not.toBeInTheDocument();
  });

  it('follows the URL when the Board is opened again without its filter', () => {
    const { rerender } = renderWithTheme(
      <Board
        project={project}
        tickets={board}
        filter={{ query: 'fix', labels: [] }}
      />,
    );

    rerender(
      <Board project={project} tickets={board} filter={noBoardFilter} />,
    );

    expect(search()).toHaveValue('');
    expect(cardsIn('Todo')).toHaveLength(3);
  });

  it('keeps the search being typed when the Board refreshes with the URL it wrote', async () => {
    replaceState();
    const { rerender } = renderWithTheme(
      <Board project={project} tickets={board} />,
    );
    await userEvent.type(search(), 'fix');
    await waitFor(() => expect(window.history.replaceState).toHaveBeenCalled());
    await userEvent.type(search(), ' the f');

    rerender(
      <Board
        project={project}
        tickets={board}
        filter={{ query: 'fix', labels: [] }}
      />,
    );

    expect(search()).toHaveValue('fix the f');
    expect(cardsIn('Todo')).toEqual(['Fix the footer']);
  });

  it('says briefly when an Epic added inline is hidden by the filter', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 81 });
    const filter = { query: 'fix', labels: [] };
    const { rerender } = renderWithTheme(
      <Board project={project} tickets={board} filter={filter} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'New Epic' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Epic title' }),
      'Checkout{Enter}',
    );
    const epic = ticket({ number: 81, title: 'Checkout', type: 'Epic' });
    rerender(
      <Board
        project={project}
        tickets={[...board, epic]}
        epics={[epic]}
        filter={filter}
      />,
    );

    expect(
      await screen.findByText('T81 created, hidden by the filter'),
    ).toBeInTheDocument();
  });

  it('says nothing when a Ticket added inline that matched is edited out of the filter', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 80 });
    const filter = { query: 'fix', labels: [] };
    const { rerender } = renderWithTheme(
      <Board project={project} tickets={board} filter={filter} />,
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Ticket title' }),
      'Fix the logo{Enter}',
    );
    const logo = ticket({ number: 80, title: 'Fix the logo' });
    rerender(
      <Board project={project} tickets={[...board, logo]} filter={filter} />,
    );

    rerender(
      <Board
        project={project}
        tickets={[...board, { ...logo, title: 'Draw the logo' }]}
        filter={filter}
      />,
    );

    expect(screen.queryByText(/hidden by the filter/)).not.toBeInTheDocument();
  });
});
