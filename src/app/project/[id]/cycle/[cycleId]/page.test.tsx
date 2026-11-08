import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { appConversations } from '../../../../../conversations/app-conversations';
import type { Conversation } from '../../../../../conversations/conversations';
import { showOpenPopovers } from '../../../../../test/popover';
import {
  renderPage,
  renderPageError,
  renderWithTheme,
} from '../../../../../test/render';
import { createTestTickets } from '../../../../../test/tickets';
import { appTickets } from '../../../../../tickets/app-tickets';
import CyclePage, { generateMetadata } from './page';

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn((): never => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../../../../../tickets/app-tickets', () => ({
  appTickets: vi.fn(),
}));
vi.mock('../../../../../conversations/app-conversations', () => ({
  appConversations: vi.fn(),
}));
vi.mock('../../../../conversations/actions', () => ({
  currentConversationActivity: vi.fn(() => new Promise(() => {})),
}));
vi.mock('../../../../../components/cycle-header/cycle-header', () => ({
  CycleHeader: ({
    cycle,
    activeCycle,
  }: {
    cycle: { title: string; state: string };
    activeCycle?: { title: string };
  }) => (
    <header>
      <h2>{cycle.title}</h2>
      {`Active: ${activeCycle?.title ?? 'none'}`}
      {cycle.state === 'Prepared' && <button type="button">Start Cycle</button>}
    </header>
  ),
}));

vi.mock('../../board-ticket-drawer/board-ticket-drawer', () => ({
  BoardTicketDrawer: ({ number }: { number: number }) =>
    `T${number}'s contents`,
}));
vi.mock(
  '../../../../../components/ticket-drawer-shell/ticket-drawer-shell',
  () => ({
    TicketDrawerShell: ({
      number,
      boardPath,
      children,
    }: {
      number: number;
      boardPath: string;
      children: ReactNode;
    }) => (
      <div role="dialog">
        {`Drawer T${number} over ${boardPath}: `}
        {children}
      </div>
    ),
  }),
);

showOpenPopovers();

const noSearch = Promise.resolve({});

const conversation = (
  fields: Pick<Conversation, 'intent' | 'state'>,
): Conversation => fields as Conversation;

const stubConversations = (list: Conversation[]) =>
  vi.mocked(appConversations).mockReturnValue({
    list: () => list,
  } as unknown as ReturnType<typeof appConversations>);

describe('CyclePage', () => {
  beforeEach(() => {
    notFound.mockClear();
    stubConversations([]);
  });

  describe('an Active Cycle', () => {
    it("shows its Tickets in one column, with the Cycle's progress and run slots, instead of the five Lanes", async () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });
      tickets.setProjectAgentSettings(project.id, {
        parallelRuns: true,
        maxConcurrentRuns: 3,
      });
      const cycle = tickets.createCycle({
        projectId: project.id,
        title: 'Factory Board',
      });
      const planned = tickets.createTicket({
        projectId: project.id,
        title: 'Show the status line',
        cycleId: cycle.id,
      });
      tickets.updateTicket(planned.number, { status: 'In progress' });
      tickets.createTicket({
        projectId: project.id,
        title: 'In the Backlog',
        labels: ['ready-for-agent'],
      });
      tickets.startCycle(cycle.id);
      vi.mocked(appTickets).mockReturnValue(tickets);
      stubConversations([
        conversation({ intent: 'start', state: 'running' }),
        conversation({ intent: 'start', state: 'waiting' }),
        conversation({ intent: 'start', state: 'idle' }),
        conversation({ intent: 'triage', state: 'running' }),
      ]);
      const params = Promise.resolve({
        id: String(project.id),
        cycleId: String(cycle.id),
      });

      await renderPage(
        <main>{await CyclePage({ params, searchParams: noSearch })}</main>,
      );

      expect(screen.getByText('0/1 done')).toBeVisible();
      expect(screen.getByText('Runs 2/3')).toBeVisible();
      expect(
        within(screen.getByRole('region', { name: 'Needs you' })).getByRole(
          'link',
          {
            name: 'Show the status line',
          },
        ),
      ).toBeVisible();
      expect(screen.queryByText('In the Backlog')).not.toBeInTheDocument();
      expect(screen.queryByText(/^Tickets:/)).not.toBeInTheDocument();
    });

    it("shows only its own Intake in Needs you, none of the Backlog's", async () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });
      const cycle = tickets.createCycle({
        projectId: project.id,
        title: 'Now',
      });
      tickets.startCycle(cycle.id);
      tickets.createTicket({
        projectId: project.id,
        title: 'Planned idea',
        labels: ['needs-triage'],
        cycleId: cycle.id,
      });
      tickets.createTicket({
        projectId: project.id,
        title: 'Filed by a run',
        labels: ['needs-triage'],
      });
      tickets.createTicket({
        projectId: project.id,
        title: 'Ready, not planned',
        labels: ['ready-for-agent'],
      });
      vi.mocked(appTickets).mockReturnValue(tickets);
      document.title = 'Now | Tandembike';

      await renderPage(
        <main>
          {
            await CyclePage({
              params: Promise.resolve({
                id: String(project.id),
                cycleId: String(cycle.id),
              }),
              searchParams: noSearch,
            })
          }
        </main>,
      );

      expect(
        within(screen.getByRole('region', { name: 'Intake' })).getByRole(
          'link',
          { name: 'Planned idea' },
        ),
      ).toBeVisible();
      expect(screen.queryByText('Filed by a run')).toBe(null);
      expect(screen.queryByText('Ready, not planned')).toBe(null);
      // The browser tab counts the planned idea only.
      await vi.waitFor(() =>
        expect(document.title).toBe('(1) Now | Tandembike'),
      );
    });

    it("lists only an Epic's children planned in it, saying when the rest are elsewhere", async () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });
      const cycle = tickets.createCycle({
        projectId: project.id,
        title: 'Now',
      });
      const split = tickets.createTicket({
        projectId: project.id,
        title: 'Split Epic',
        type: 'Epic',
        labels: ['ready-for-agent'],
        cycleId: cycle.id,
      });
      tickets.createTicket({
        projectId: project.id,
        title: 'Planned child',
        epicNumber: split.number,
        labels: ['ready-for-agent'],
        cycleId: cycle.id,
      });
      tickets.createTicket({
        projectId: project.id,
        title: 'Backlog child',
        epicNumber: split.number,
        labels: ['ready-for-agent'],
      });
      const away = tickets.createTicket({
        projectId: project.id,
        title: 'Away Epic',
        type: 'Epic',
        labels: ['ready-for-agent'],
        cycleId: cycle.id,
      });
      tickets.createTicket({
        projectId: project.id,
        title: 'Away child',
        epicNumber: away.number,
        labels: ['ready-for-agent'],
      });
      tickets.createTicket({
        projectId: project.id,
        title: 'Empty Epic',
        type: 'Epic',
        labels: ['ready-for-agent'],
        cycleId: cycle.id,
      });
      tickets.startCycle(cycle.id);
      vi.mocked(appTickets).mockReturnValue(tickets);

      await renderPage(
        <main>
          {
            await CyclePage({
              params: Promise.resolve({
                id: String(project.id),
                cycleId: String(cycle.id),
              }),
              searchParams: noSearch,
            })
          }
        </main>,
      );

      const queued = screen.getByRole('region', { name: 'Queued' });
      expect(within(queued).getByText('Planned child')).toBeInTheDocument();
      expect(screen.queryByText('Backlog child')).toBe(null);
      expect(screen.queryByText('Away child')).toBe(null);
      expect(
        within(queued).getByText('No children in this Cycle (1 elsewhere)'),
      ).toBeInTheDocument();
      // An Epic without children waits in Intake to be split (T1139).
      expect(
        within(screen.getByRole('region', { name: 'Intake' })).getByText(
          'Ready for an Agent once split: no children yet. Triage it to split it.',
        ),
      ).toBeInTheDocument();
    });

    it('shows an Epic when its children are planned, though it is not, in Needs you while its run is not going', async () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });
      const cycle = tickets.createCycle({
        projectId: project.id,
        title: 'Now',
      });
      const epic = tickets.createTicket({
        projectId: project.id,
        title: 'Big idea',
        type: 'Epic',
      });
      const child = tickets.createTicket({
        projectId: project.id,
        title: 'Epic rows',
        epicNumber: epic.number,
        cycleId: cycle.id,
      });
      tickets.updateTicket(child.number, { status: 'In progress' });
      tickets.startCycle(cycle.id);
      vi.mocked(appTickets).mockReturnValue(tickets);

      await renderPage(
        <main>
          {
            await CyclePage({
              params: Promise.resolve({
                id: String(project.id),
                cycleId: String(cycle.id),
              }),
              searchParams: noSearch,
            })
          }
        </main>,
      );

      // With no Claim or live run it is Action needed, and so not In flight.
      expect(
        within(screen.getByRole('region', { name: 'Needs you' })).getByRole(
          'link',
          { name: 'Big idea' },
        ),
      ).toBeVisible();
      expect(screen.getByText('Nothing in flight.')).toBeVisible();
    });

    it("leaves out Epics with no Tickets on it, the Backlog's Intake Epic too", async () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });
      const earlier = tickets.createCycle({
        projectId: project.id,
        title: 'Earlier',
      });
      const cycle = tickets.createCycle({
        projectId: project.id,
        title: 'Now',
      });
      tickets.createTicket({
        projectId: project.id,
        title: 'Rough idea',
        type: 'Epic',
        labels: ['needs-triage'],
      });
      tickets.createTicket({
        projectId: project.id,
        title: 'Ready, not planned',
        type: 'Epic',
        labels: ['ready-for-agent'],
      });
      tickets.createTicket({
        projectId: project.id,
        title: 'Planned elsewhere',
        type: 'Epic',
        labels: ['ready-for-agent'],
        cycleId: earlier.id,
      });
      tickets.startCycle(cycle.id);
      vi.mocked(appTickets).mockReturnValue(tickets);

      await renderPage(
        <main>
          {
            await CyclePage({
              params: Promise.resolve({
                id: String(project.id),
                cycleId: String(cycle.id),
              }),
              searchParams: noSearch,
            })
          }
        </main>,
      );

      expect(screen.queryByText('Rough idea')).toBe(null);
      expect(screen.queryByText('Ready, not planned')).toBe(null);
      expect(screen.queryByText('Planned elsewhere')).toBe(null);
    });

    it('allows one Start run at a time without parallel runs', async () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });
      const cycle = tickets.createCycle({
        projectId: project.id,
        title: 'Now',
      });
      tickets.startCycle(cycle.id);
      vi.mocked(appTickets).mockReturnValue(tickets);

      await renderPage(
        <main>
          {
            await CyclePage({
              params: Promise.resolve({
                id: String(project.id),
                cycleId: String(cycle.id),
              }),
              searchParams: noSearch,
            })
          }
        </main>,
      );

      expect(screen.getByText('Runs 0/1')).toBeVisible();
    });

    it("opens ?ticket= in a drawer over it, and its rows link to the Cycle's path", async () => {
      const tickets = createTestTickets();
      const project = tickets.createProject({ name: 'Website' });
      const cycle = tickets.createCycle({
        projectId: project.id,
        title: 'Now',
      });
      const ticket = tickets.createTicket({
        projectId: project.id,
        title: 'Ship it',
        cycleId: cycle.id,
      });
      tickets.startCycle(cycle.id);
      vi.mocked(appTickets).mockReturnValue(tickets);
      const params = Promise.resolve({
        id: String(project.id),
        cycleId: String(cycle.id),
      });
      const searchParams = Promise.resolve({ ticket: String(ticket.number) });

      await renderPage(
        <main>{await CyclePage({ params, searchParams })}</main>,
      );

      const path = `/project/${project.id}/cycle/${cycle.id}`;
      expect(screen.getByRole('dialog')).toHaveTextContent(
        `Drawer T${ticket.number} over ${path}:`,
      );
      expect(screen.getByRole('link', { name: 'Ship it' })).toHaveAttribute(
        'href',
        `${path}?ticket=${ticket.number}`,
      );
    });
  });

  it("shows the Cycle's header above its Board, under the layout's tabs", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const cycle = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.createTicket({ projectId: project.id, title: 'In the Backlog' });
    const planned = tickets.createTicket({
      projectId: project.id,
      title: 'Planned',
      cycleId: cycle.id,
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const params = Promise.resolve({
      id: String(project.id),
      cycleId: String(cycle.id),
    });
    await renderPage(
      <main>{await CyclePage({ params, searchParams: noSearch })}</main>,
    );

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Launch' }),
    ).toBeInTheDocument();
    // A Prepared Cycle's Board: its Tickets in one column, with progress but
    // no run slots, and the header's Start Cycle choice of Active Cycle.
    expect(screen.getByText('Active: none')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start Cycle' })).toBeVisible();
    expect(screen.getByText('0/1 done')).toBeVisible();
    expect(
      screen.getByRole('progressbar', { name: 'Cycle progress' }),
    ).toBeVisible();
    expect(screen.queryByText(/^Runs /)).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Needs you' })).getByRole(
        'link',
        { name: planned.title },
      ),
    ).toBeVisible();
    expect(screen.queryByText('In the Backlog')).not.toBeInTheDocument();
    await expect(
      generateMetadata({ params, searchParams: noSearch }),
    ).resolves.toEqual({
      title: 'Launch · Website',
    });
  });

  it("gives the selection bar every live Epic of the Project, planned or not, to pick the Cycle's from", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const cycle = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    const epic = tickets.createTicket({
      projectId: project.id,
      title: 'Checkout',
      type: 'Epic',
    });
    tickets.createTicket({
      projectId: project.id,
      title: 'Pay by card',
      epicNumber: epic.number,
      cycleId: cycle.id,
    });
    const archived = tickets.createTicket({
      projectId: project.id,
      title: 'Old',
      type: 'Epic',
    });
    tickets.archiveTicket(archived.number);
    tickets.createTicket({ projectId: project.id, title: 'Not an Epic' });
    tickets.createTicket({
      projectId: project.id,
      title: 'Pick me',
      cycleId: cycle.id,
    });
    vi.mocked(appTickets).mockReturnValue(tickets);

    const params = Promise.resolve({
      id: String(project.id),
      cycleId: String(cycle.id),
    });
    await renderPage(
      <main>{await CyclePage({ params, searchParams: noSearch })}</main>,
    );

    await userEvent.click(
      screen.getByRole('checkbox', { name: /Select T\d+ Pick me/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: /Add to Epic/ }));
    expect(
      screen.getByRole('menuitem', { name: new RegExp(epic.title) }),
    ).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /Old/ })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Not an Epic/ })).toBeNull();
  });

  it("shows an archived Cycle's final Tickets read-only", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const done = tickets.createTicket({
      projectId: project.id,
      title: 'Shipped',
      cycleId: cycle.id,
    });
    tickets.updateTicket(done.number, { status: 'Done' });
    const moved = tickets.createTicket({
      projectId: project.id,
      title: 'Moved',
      cycleId: cycle.id,
    });
    // Done, so it stays with the Cycle once archived, then moves Project.
    tickets.updateTicket(moved.number, { status: 'Done' });
    tickets.startCycle(cycle.id);
    tickets.archiveCycle(cycle.id);
    const other = tickets.createProject({ name: 'App' });
    tickets.updateTicket(moved.number, { projectId: other.id });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await renderPage(
      <main>
        {
          await CyclePage({
            params: Promise.resolve({
              id: String(project.id),
              cycleId: String(cycle.id),
            }),
            searchParams: noSearch,
          })
        }
      </main>,
    );

    // The mocked Board lists its Tickets; the History page has no Board.
    expect(screen.queryByText(/^Tickets:/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('list', { name: 'Tickets in this Cycle' }),
    ).toHaveTextContent(`T${done.number}ShippedDoneT${moved.number}MovedDone`);
  });

  it("tells a Prepared Cycle's header which Cycle is Active", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const beta = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const launch = tickets.createCycle({
      projectId: project.id,
      title: 'Launch',
    });
    tickets.startCycle(beta.id);
    vi.mocked(appTickets).mockReturnValue(tickets);

    await renderPage(
      <main>
        {
          await CyclePage({
            params: Promise.resolve({
              id: String(project.id),
              cycleId: String(launch.id),
            }),
            searchParams: noSearch,
          })
        }
      </main>,
    );

    expect(screen.getByRole('banner')).toHaveTextContent('Active: Beta');
  });

  it("does not show another Project's Cycle", async () => {
    const tickets = createTestTickets();
    const requested = tickets.createProject({ name: 'Requested' });
    const owning = tickets.createProject({ name: 'Owning' });
    const cycle = tickets.createCycle({ projectId: owning.id, title: 'Beta' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await expect(
      renderPageError(
        <main>
          {
            await CyclePage({
              params: Promise.resolve({
                id: String(requested.id),
                cycleId: String(cycle.id),
              }),
              searchParams: noSearch,
            })
          }
        </main>,
      ),
    ).resolves.toMatchObject({ message: 'NEXT_NOT_FOUND' });
    expect(notFound).toHaveBeenCalledOnce();
  });

  it('shows the loading state until the Project and Cycle load', async () => {
    vi.mocked(appTickets).mockReturnValue(createTestTickets());

    renderWithTheme(
      <main>
        {
          await CyclePage({
            params: new Promise(() => {}),
            searchParams: noSearch,
          })
        }
      </main>,
    );

    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });

  it.each([
    ['missing Project', '999', '1'],
    ['missing Cycle', '1', '999'],
    ['malformed Cycle id', '1', 'beta'],
  ])('returns not-found for a %s', async (_scenario, id, cycleId) => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    tickets.createCycle({ projectId: project.id, title: 'Beta' });
    vi.mocked(appTickets).mockReturnValue(tickets);

    await expect(
      renderPageError(
        <main>
          {
            await CyclePage({
              params: Promise.resolve({ id, cycleId }),
              searchParams: noSearch,
            })
          }
        </main>,
      ),
    ).resolves.toMatchObject({ message: 'NEXT_NOT_FOUND' });
    expect(notFound).toHaveBeenCalledOnce();
  });

  it("opens ?ticket= in a drawer that closes to the Cycle's tab", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Ship it',
      cycleId: cycle.id,
    });
    vi.mocked(appTickets).mockReturnValue(tickets);
    const params = Promise.resolve({
      id: String(project.id),
      cycleId: String(cycle.id),
    });
    const searchParams = Promise.resolve({ ticket: String(ticket.number) });

    await renderPage(<main>{await CyclePage({ params, searchParams })}</main>);

    expect(screen.getByRole('dialog')).toHaveTextContent(
      `Drawer T${ticket.number} over /project/${project.id}/cycle/${cycle.id}`,
    );
    await expect(generateMetadata({ params, searchParams })).resolves.toEqual({
      title: `T${ticket.number} Ship it`,
    });
  });

  it("closes the drawer to the Cycle's tab with its filter", async () => {
    const tickets = createTestTickets();
    const project = tickets.createProject({ name: 'Website' });
    const cycle = tickets.createCycle({ projectId: project.id, title: 'Beta' });
    const ticket = tickets.createTicket({
      projectId: project.id,
      title: 'Ship it',
      cycleId: cycle.id,
    });
    vi.mocked(appTickets).mockReturnValue(tickets);
    const params = Promise.resolve({
      id: String(project.id),
      cycleId: String(cycle.id),
    });
    const searchParams = Promise.resolve({
      ticket: String(ticket.number),
      label: 'bug',
    });

    await renderPage(<main>{await CyclePage({ params, searchParams })}</main>);

    expect(screen.getByRole('dialog')).toHaveTextContent(
      `Drawer T${ticket.number} over /project/${project.id}/cycle/${cycle.id}?label=bug`,
    );
  });
});
