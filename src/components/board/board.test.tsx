import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { reorderTickets, updateTicket } from '../../app/tickets/actions';
import { keyboardDrag, stubDragAndDrop } from '../../test/drag-and-drop';
import { renderWithTheme } from '../../test/render';
import type { Ticket } from '../../tickets/tickets';
import { Board } from './board';

vi.mock('../../app/projects/actions', () => ({ renameProject: vi.fn() }));
vi.mock('../../app/tickets/actions', () => ({
  createTicket: vi.fn(),
  reorderTickets: vi.fn(),
  updateTicket: vi.fn(),
}));
stubDragAndDrop();

const project = { id: 1, name: 'Website', createdAt: new Date('2026-01-01') };

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
    .map((card) => within(card).getByRole('link').getAttribute('aria-label'));

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

describe('Board with archived Tickets', () => {
  const tickets = [
    ticket({ number: 4, title: 'Fix the header' }),
    ticket({ number: 5, title: 'Old idea', archived: true }),
    ticket({ number: 6, title: 'Shipped', status: 'Done', archived: true }),
  ];
  const showArchived = () =>
    userEvent.click(screen.getByRole('checkbox', { name: 'Show archived' }));
  const archivedList = () =>
    screen.queryByRole('region', { name: 'Archived Tickets' });

  it('leaves archived Tickets out of the columns', () => {
    renderWithTheme(<Board project={project} tickets={tickets} />);

    expect(cardsIn('Todo')).toEqual(['Fix the header']);
    expect(cardsIn('Done')).toEqual([]);
  });

  it('hides the archived Tickets until the User asks for them', () => {
    renderWithTheme(<Board project={project} tickets={tickets} />);

    expect(
      screen.getByRole('checkbox', { name: 'Show archived' }),
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
      '/project/1/ticket/5',
      '/project/1/ticket/6',
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
      screen.getByRole('checkbox', { name: 'Show archived' }),
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
