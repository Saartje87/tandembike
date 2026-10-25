import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  attachTicketToEpic,
  createTicket,
  reorderTickets,
  updateTicket,
} from '../../app/tickets/actions';
import { keyboardDrag, stubDragAndDrop } from '../../test/drag-and-drop';
import { renderWithTheme } from '../../test/render';
import type { Ticket } from '../../tickets/tickets';
import { Board } from './board';

vi.mock('../../app/projects/actions', () => ({
  renameProject: vi.fn(),
  styleProject: vi.fn(),
}));
vi.mock('../../app/tickets/actions', () => ({
  attachTicketToEpic: vi.fn(),
  createTicket: vi.fn(),
  reorderTickets: vi.fn(),
  updateTicket: vi.fn(),
}));
stubDragAndDrop();

const project = {
  id: 1,
  name: 'Website',
  color: null,
  icon: null,
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
    name: `Drag Ticket #${number} to another Status`,
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

    expect(screen.getByRole('button', { name: 'Rename' })).toBeInTheDocument();
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
      error: 'There is no Ticket #4.',
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
      'There is no Ticket #4.',
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
      error: 'There is no Ticket #4.',
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
      'There is no Ticket #4.',
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

    expect(chips()).toEqual(['#10 Checkout 0/1 Done', '#20 Search 0/0 Done']);
  });

  it("lists on a Cycle's Board only the Epics with a child planned into it", () => {
    renderWithTheme(
      <Board
        project={project}
        tickets={[payByCard, search]}
        epics={[checkout, search]}
        cycleId={7}
      />,
    );

    expect(chips()).toEqual(['#10 Checkout 0/1 Done']);
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
      within(list as HTMLElement).getByText('#5', { exact: false }),
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
      name: new RegExp(`^#${epicNumber} `),
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
        name: `Drag Ticket #${number} to another Status`,
      }),
      '{ArrowRight}',
    );
  };

  beforeEach(() => {
    vi.mocked(attachTicketToEpic).mockReset();
    vi.mocked(reorderTickets).mockReset();
    vi.mocked(updateTicket).mockReset();
  });

  it('attaches the Ticket to the Epic at once, leaving its Status and place alone', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(attachTicketToEpic).mockReturnValue(promise);
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

    expect(attachTicketToEpic).toHaveBeenCalledExactlyOnceWith({
      epic: 20,
      child: 4,
    });
    expect(updateTicket).not.toHaveBeenCalled();
    expect(reorderTickets).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(chips()).toEqual(['#10 Checkout 0/1 Done', '#20 Search 0/1 Done']),
    );
    expect(cardsIn('Todo')).toEqual(['Pay by card', 'Fix the header']);
    expect(
      screen.getByRole('link', { name: 'Epic #20 Search' }),
    ).toBeInTheDocument();
  });

  it('moves a child of another Epic to the dropped-on one', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(attachTicketToEpic).mockReturnValue(promise);
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

    expect(attachTicketToEpic).toHaveBeenCalledExactlyOnceWith({
      epic: 20,
      child: 11,
    });
    await waitFor(() =>
      expect(chips()).toEqual(['#10 Checkout 0/0 Done', '#20 Search 0/1 Done']),
    );
  });

  it('puts the Ticket back and explains when attaching is refused', async () => {
    vi.mocked(attachTicketToEpic).mockResolvedValue({
      ok: false,
      error: 'Epic #20 is archived. Restore it before adding Tickets to it.',
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
      'Epic #20 is archived. Restore it before adding Tickets to it.',
    );
    await waitFor(() =>
      expect(chips()).toEqual(['#10 Checkout 0/1 Done', '#20 Search 0/0 Done']),
    );
  });
});
