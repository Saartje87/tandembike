import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { planTickets, unplanTickets } from '../../app/cycles/actions';
import {
  archiveTickets,
  createTicket,
  moveTickets,
  moveTicketsToEpic,
  reorderTickets,
  updateTicket,
} from '../../app/tickets/actions';
import { keyboardDrag, stubDragAndDrop } from '../../test/drag-and-drop';
import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import type { Cycle } from '../../tickets/cycles';
import type { Ticket } from '../../tickets/tickets';
import { Board } from './board';

vi.mock('../../app/cycles/actions', () => ({
  planTickets: vi.fn(),
  unplanTickets: vi.fn(),
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
    .map((card) =>
      within(card).getAllByRole('link')[0].getAttribute('aria-label'),
    );

const mockBoardBounds = (targetStatus: string) =>
  vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (
        this.tagName === 'LI' &&
        this.querySelector('button[aria-label^="Drag Ticket"]')
      ) {
        return new DOMRect(0, 0, 100, 100);
      }
      if (this.tagName === 'SECTION') {
        const headingId = this.getAttribute('aria-labelledby');
        if (
          headingId &&
          document.getElementById(headingId)?.textContent === targetStatus
        ) {
          return new DOMRect(60, 0, 100, 300);
        }
        return new DOMRect(500, 0, 100, 300);
      }
      return new DOMRect(0, 0, 800, 700);
    });

const dragTicketTo = async (number: number, status: string) => {
  const handle = screen.getByRole('button', {
    name: `Drag Ticket T${number} to another Status`,
  });
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
  await keyboardDrag(handle, '{ArrowRight}{ArrowRight}{ArrowRight}');
};

describe('Board', () => {
  beforeEach(() => {
    vi.mocked(reorderTickets).mockReset();
    vi.mocked(updateTicket).mockReset();
  });

  it("shows the Project's name", () => {
    renderWithTheme(<Board project={project} tickets={[]} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Website' }),
    ).toBeInTheDocument();
  });

  it('leaves the breadcrumbs to the page header', () => {
    renderWithTheme(<Board project={project} tickets={[]} />);

    expect(
      screen.queryByRole('navigation', { name: 'Breadcrumb' }),
    ).not.toBeInTheDocument();
  });

  it('offers to rename the Project from its header', () => {
    renderWithTheme(<Board project={project} tickets={[]} />);

    expect(
      screen.getByRole('button', { name: 'Website' }),
    ).toHaveAccessibleDescription('Edit project name');
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

  it('shows its header under the Project name', () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={[]}
        header={<nav aria-label="Project views" />}
      />,
    );

    expect(
      screen.getByRole('navigation', { name: 'Project views' }),
    ).toBeInTheDocument();
  });

  it('does not show a Status dropdown on Ticket cards', () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={[ticket({ number: 4, title: 'Fix the header' })]}
      />,
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
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
      screen.queryByRole('checkbox', { name: /Show done Epics/ }),
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
      screen.getByRole('checkbox', { name: 'Show done Epics (1)' }),
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
    userEvent.click(screen.getByRole('checkbox', { name: /^Show archived/ }));
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
      screen.getByRole('checkbox', { name: 'Show archived (2)' }),
    ).toBeInTheDocument();
    unmount();

    renderWithTheme(
      <Board
        project={project}
        tickets={tickets.filter((ticket) => !ticket.archived)}
      />,
    );
    expect(
      screen.getByRole('checkbox', { name: 'Show archived (0)' }),
    ).toBeInTheDocument();
  });

  it('hides the archived Tickets until the User asks for them', () => {
    renderWithTheme(<Board project={project} tickets={tickets} />);

    expect(
      screen.getByRole('checkbox', { name: 'Show archived (2)' }),
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
      screen.getByRole('checkbox', { name: 'Show archived (2)' }),
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
      element.querySelector('button[aria-label^="Drag Ticket"]') === null;
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (isChip(this)) {
          return new DOMRect(60, 0, 100, 40);
        }
        if (
          this.tagName === 'LI' &&
          this.querySelector('button[aria-label^="Drag Ticket"]')
        ) {
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
    await keyboardDrag(
      screen.getByRole('button', {
        name: `Drag Ticket T${number} to another Status`,
      }),
      '{ArrowRight}',
    );
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

    await dragTicketOntoEpic(4, 20);

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

    await user.click(screen.getByRole('checkbox', { name: /Show archived/ }));

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

    await dragTicketTo(9, 'Done');

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
    vi.mocked(planTickets).mockReset();
    vi.mocked(unplanTickets).mockReset();
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

    await user.click(screen.getByRole('button', { name: 'Plan into Cycle' }));

    const menu = screen.getByRole('dialog', { name: 'Plan into Cycle' });
    expect(
      within(menu)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Launch', 'Beta']);
    expect(
      screen.queryByRole('button', { name: 'Remove from Cycle' }),
    ).not.toBeInTheDocument();
  });

  it('plans the whole selection into the chosen Cycle, in Board order', async () => {
    vi.mocked(planTickets).mockResolvedValue({ ok: true, failed: [] });
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

    await user.click(screen.getByRole('button', { name: 'Plan into Cycle' }));
    await user.click(screen.getByRole('button', { name: 'Beta' }));

    expect(planTickets).toHaveBeenCalledExactlyOnceWith({
      cycleId: beta.id,
      ticketNumbers: [4, 15],
    });
    await waitFor(() => expect(selectionBar()).not.toBeInTheDocument());
    expect(selectedTitles()).toEqual([]);
  });

  it('keeps the refused Tickets selected and lists why each was refused', async () => {
    const refusal =
      'Ticket T15 is already planned into the Cycle "Launch". Remove it from that Cycle first.';
    vi.mocked(planTickets).mockResolvedValue({
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

    await user.click(screen.getByRole('button', { name: 'Plan into Cycle' }));
    await user.click(screen.getByRole('button', { name: 'Beta' }));

    const refusals = await screen.findByRole('list', { name: 'Not planned' });
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
      screen.queryByRole('list', { name: 'Not planned' }),
    ).not.toBeInTheDocument();
  });

  it('keeps a card picked while the plan saves selected', async () => {
    const { promise, resolve } = Promise.withResolvers<{
      ok: true;
      failed: [];
    }>();
    vi.mocked(planTickets).mockReturnValue(promise);
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
    await user.click(screen.getByRole('button', { name: 'Plan into Cycle' }));
    await user.click(screen.getByRole('button', { name: 'Beta' }));

    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();

    await user.click(checkbox(7, 'Write the copy'));
    await act(async () => resolve({ ok: true, failed: [] }));

    expect(selectedTitles()).toEqual(['Select T7 Write the copy']);
  });

  it('keeps the selection and explains when the whole batch is refused', async () => {
    vi.mocked(planTickets).mockResolvedValue({
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

    await user.click(screen.getByRole('button', { name: 'Plan into Cycle' }));
    await user.click(screen.getByRole('button', { name: 'Beta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Cycle "Beta" is Archived and can no longer change.',
    );
    expect(selectedTitles()).toEqual([
      'Select T4 Fix the header',
      'Select T15 Deploy',
    ]);
  });

  it("removes the selection from the Cycle on that Cycle's Board", async () => {
    vi.mocked(unplanTickets).mockResolvedValue({ ok: true, failed: [] });
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        cycles={cycles}
        cycleId={launch.id}
      />,
    );
    await selectTwo(user);

    expect(
      screen.queryByRole('button', { name: 'Plan into Cycle' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove from Cycle' }));

    expect(unplanTickets).toHaveBeenCalledExactlyOnceWith({
      cycleId: launch.id,
      ticketNumbers: [4, 15],
    });
    await waitFor(() => expect(selectionBar()).not.toBeInTheDocument());
  });

  it('keeps the Tickets it could not remove selected, with the reasons', async () => {
    const refusal = 'Ticket T4 is not planned into the Cycle "Launch".';
    vi.mocked(unplanTickets).mockResolvedValue({
      ok: true,
      failed: [{ number: 4, error: refusal }],
    });
    const user = userEvent.setup();
    renderWithTheme(
      <Board
        project={project}
        tickets={board}
        cycles={cycles}
        cycleId={launch.id}
      />,
    );
    await selectTwo(user);

    await user.click(screen.getByRole('button', { name: 'Remove from Cycle' }));

    const refusals = await screen.findByRole('list', { name: 'Not removed' });
    expect(refusals).toHaveTextContent(refusal);
    expect(selectedTitles()).toEqual(['Select T4 Fix the header']);
  });

  it('offers no menu without a Cycle to plan into', async () => {
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
      screen.queryByRole('button', { name: 'Plan into Cycle' }),
    ).not.toBeInTheDocument();
  });
});
