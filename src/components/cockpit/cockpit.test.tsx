import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { currentConversationActivity } from '../../app/conversations/actions';
import { moveTicketsToCycle } from '../../app/cycles/actions';
import { archiveTickets, moveTicketsToEpic } from '../../app/tickets/actions';
import { noConversationActivity } from '../../conversations/conversation-activity';
import { activity, liveConversation } from '../../test/conversation-activity';
import { mockRouter } from '../../test/navigation';
import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import type { Cycle } from '../../tickets/cycles';
import type { Ticket } from '../../tickets/tickets';
import { ConversationActivityProvider } from '../conversation-activity/conversation-activity';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { LiveUpdates } from '../live-updates/live-updates';
import { Cockpit } from './cockpit';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../conversation-dialog-provider/conversation-dialog-provider', () => ({
  useConversationDialog: vi.fn(),
}));
vi.mock('../../app/conversations/actions', () => ({
  currentConversationActivity: vi.fn(),
}));

vi.mock('../../app/cycles/actions', () => ({ moveTicketsToCycle: vi.fn() }));
vi.mock('../../app/tickets/actions', () => ({
  archiveTickets: vi.fn(),
  moveTicketsToEpic: vi.fn(),
}));

showOpenPopovers();

const ticket = (
  fields: Partial<Ticket> & Pick<Ticket, 'number' | 'title'>,
): Ticket => ({
  description: '',
  status: 'Todo',
  projectId: 3,
  position: 0,
  archived: false,
  labels: [],
  externalReferences: [],
  attachments: [],
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

const claim = { agentRunId: 'run-1', agentName: null };

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
}

const tickets = [
  ticket({
    number: 7,
    title: 'Status line',
    status: 'In progress',
    claim,
  }),
  ticket({
    number: 8,
    title: 'Merge button',
    status: 'In progress',
    externalReferences: ['https://github.com/owner/repo/pull/87'],
  }),
  ticket({ number: 9, title: 'Pick a ceiling', labels: ['ready-for-human'] }),
  ticket({
    number: 10,
    title: 'Cache the Board',
    labels: ['ready-for-agent'],
    blockedBy: [7],
    blocked: true,
  }),
  ticket({ number: 11, title: 'Old work', status: 'Done' }),
];

const renderCockpit = (shown: Ticket[] = tickets) =>
  renderWithTheme(
    <ConversationActivityProvider>
      <Cockpit
        projectId={3}
        cycle={{ id: 9, title: 'Factory Board' }}
        tickets={shown}
        runSlots={{ used: 1, cap: 3 }}
      />
    </ConversationActivityProvider>,
  );

const section = (name: string) => screen.getByRole('region', { name });

const dialog = { open: vi.fn() };
vi.mocked(useConversationDialog).mockReturnValue(
  dialog as unknown as ReturnType<typeof useConversationDialog>,
);

describe('Cockpit', () => {
  afterEach(() => {
    dialog.open.mockReset();
    vi.unstubAllGlobals();
    vi.mocked(currentConversationActivity).mockReset();
  });

  it("shows the Cycle's progress and the run slots in use", async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit();

    expect(screen.getByText('1/5 done')).toBeVisible();
    expect(
      screen.getByRole('progressbar', { name: 'Cycle progress' }),
    ).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByText('Runs 1/3')).toBeVisible();
  });

  it('shows each Running Ticket In flight with its live line and cost', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      activity({
        live: { 7: liveConversation({ line: 'Editing board.tsx' }) },
        cost: { 7: 1.5 },
      }),
    );
    renderCockpit();

    const inFlight = section('In flight');
    await vi.waitFor(() =>
      expect(
        within(inFlight).getByText(/^Editing board\.tsx · .+ · \$1\.50$/),
      ).toBeVisible(),
    );
    const [running] = within(inFlight).getAllByRole('listitem');
    expect(running).toHaveTextContent('T7');
    expect(within(running).getByText('Running')).toBeVisible();
  });

  it('shows Action needed and Review under Needs you, open, saying what each waits on', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      activity({
        live: {
          7: liveConversation({
            state: 'waiting',
            line: 'Allow Bash: git push?',
          }),
        },
      }),
    );
    renderCockpit([
      ...tickets,
      ticket({ number: 12, title: 'Rename lanes', status: 'In progress' }),
    ]);

    const needsYou = section('Needs you');
    const actionNeeded = section('Action needed');
    await vi.waitFor(() =>
      expect(within(actionNeeded).getAllByRole('listitem')).toHaveLength(2),
    );
    expect(within(needsYou).getAllByText('3')[0]).toBeVisible();
    expect(actionNeeded.querySelector('details')).toHaveAttribute('open');
    const [stalled, waiting] = within(actionNeeded).getAllByRole('listitem');
    expect(stalled).toHaveTextContent('Rename lanes');
    expect(stalled).toHaveTextContent(/Stalled · no Claim and no PR · /);
    expect(waiting).toHaveTextContent(/Waiting · Allow Bash: git push\? · /);
    const [review] = within(section('Review')).getAllByRole('listitem');
    expect(review).toHaveTextContent('Merge button');
    expect(
      within(review).getByRole('link', { name: 'PR #87' }),
    ).toHaveAttribute('href', 'https://github.com/owner/repo/pull/87');
    expect(within(section('In flight')).queryAllByRole('listitem')).toEqual([]);
  });

  it("opens a waiting run's Conversation from its bell", async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      activity({
        live: {
          7: liveConversation({
            conversationId: 41,
            state: 'waiting',
            line: 'Allow Bash: git push?',
          }),
        },
      }),
    );
    renderCockpit();

    const bell = await screen.findByRole('button', {
      name: 'Open the Conversation of T7',
    });
    await userEvent.click(bell);

    expect(dialog.open).toHaveBeenCalledExactlyOnceWith(41);
    expect(screen.queryByRole('button', { name: /^(Allow|Deny)/ })).toBe(null);
  });

  it('shows an idle run as Idle, with a bell', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      activity({
        live: {
          7: liveConversation({
            conversationId: 43,
            state: 'idle',
            line: 'I opened the PR.',
          }),
        },
      }),
    );
    renderCockpit();

    await screen.findByRole('button', { name: 'Open the Conversation of T7' });
    const [row] = within(section('Action needed')).getAllByRole('listitem');
    expect(row).toHaveTextContent(/Idle · I opened the PR\. · /);
  });

  it('shows a bell on failed and interrupted runs too, not on a stalled Ticket', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      activity({
        live: {
          7: liveConversation({ conversationId: 41, state: 'error' }),
          13: liveConversation({ conversationId: 42, state: 'interrupted' }),
        },
      }),
    );
    renderCockpit([
      ...tickets,
      ticket({ number: 12, title: 'Rename lanes', status: 'In progress' }),
      ticket({
        number: 13,
        title: 'Split events',
        status: 'In progress',
        claim,
      }),
    ]);

    await screen.findByRole('button', { name: 'Open the Conversation of T7' });
    expect(
      screen.getByRole('button', { name: 'Open the Conversation of T13' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Open the Conversation of T12' }),
    ).toBe(null);
  });

  it("shows Intake from the Cycle and the Backlog after Review, with each Ticket's triage label", async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderWithTheme(
      <ConversationActivityProvider>
        <Cockpit
          projectId={3}
          cycle={{ id: 9, title: 'Factory Board' }}
          tickets={[
            ...tickets,
            ticket({
              number: 14,
              title: 'Planned idea',
              createdAt: new Date('2026-11-02'),
            }),
          ]}
          backlog={[
            ticket({
              number: 20,
              title: 'Tag size missing',
              labels: ['needs-triage'],
              createdAt: new Date('2026-11-01'),
            }),
            ticket({
              number: 21,
              title: 'Ready later',
              labels: ['ready-for-agent'],
            }),
          ]}
          runSlots={{ used: 1, cap: 3 }}
        />
      </ConversationActivityProvider>,
    );

    const intake = section('Intake');
    expect(intake.querySelector('details')).toHaveAttribute('open');
    const [filed, planned] = within(intake).getAllByRole('listitem');
    expect(
      within(filed).getByRole('link', { name: 'Tag size missing' }),
    ).toHaveAttribute('href', '/project/3/cycle/9?ticket=20');
    expect(filed).toHaveTextContent(/Intake · to triage · /);
    expect(within(filed).getByText('needs-triage')).toBeVisible();
    expect(within(planned).getByText('no triage label')).toBeVisible();
    expect(screen.queryByText('Ready later')).toBe(null);
    expect(within(section('Needs you')).getAllByText('3')[0]).toBeVisible();
  });

  it("shows an In progress Epic In flight with its children's progress, opening to list them", async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      activity({ cost: { 50: 1, 31: 0.5 } }),
    );
    const link = { number: 50, title: 'Cockpit', color: 'teal' as const };
    const childOf = (number: number, status: Ticket['status']) => ({
      number,
      title: `Child ${number}`,
      status,
      archived: false,
      blockedBy: [],
      blocked: false,
    });
    renderCockpit([
      ticket({
        number: 50,
        title: 'Cockpit',
        type: 'Epic',
        color: 'teal',
        status: 'In progress',
        claim,
        children: [
          childOf(30, 'Done'),
          childOf(31, 'In progress'),
          childOf(32, 'In progress'),
        ],
      }),
      ticket({ number: 30, title: 'Child 30', status: 'Done', epic: link }),
      ticket({
        number: 31,
        title: 'Child 31',
        status: 'In progress',
        claim,
        epic: link,
      }),
      ticket({
        number: 32,
        title: 'Child 32',
        status: 'In progress',
        epic: link,
      }),
    ]);

    const inFlight = section('In flight');
    await vi.waitFor(() =>
      expect(within(inFlight).getByText(/\$1\.50/)).toBeVisible(),
    );
    const epicRow = within(inFlight)
      .getByRole('link', { name: 'Cockpit' })
      .closest('li') as HTMLElement;
    expect(
      within(epicRow).getByRole('img', { name: '1 of 3 children done' }),
    ).toBeVisible();
    const summary = epicRow.querySelector('summary') as HTMLElement;
    expect(within(summary).getByText('needs you')).toBeVisible();
    expect(within(summary).getByText('Running')).toBeVisible();
    expect(within(inFlight).queryByRole('link', { name: 'Child 31' })).toBe(
      null,
    );

    await userEvent.click(
      within(epicRow).getByRole('img', { name: '1 of 3 children done' }),
    );

    expect(epicRow.querySelector('details')).toHaveAttribute('open');
    expect(
      within(epicRow)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'T30Child 30done',
      'T31Child 31running',
      'T32Child 32needs you',
    ]);
    expect(
      within(section('Action needed')).getByRole('link', { name: 'Child 32' }),
    ).toBeVisible();
  });

  it('puts an Epic in Review in Needs you, opening the Epic, with no Merged button', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    const link = { number: 50, title: 'Cockpit', color: 'teal' as const };
    renderCockpit([
      ticket({
        number: 50,
        title: 'Cockpit',
        type: 'Epic',
        color: 'teal',
        status: 'In progress',
        externalReferences: ['https://github.com/owner/repo/pull/130'],
        children: [
          {
            number: 30,
            title: 'Child 30',
            status: 'Done',
            archived: false,
            blockedBy: [],
            blocked: false,
          },
        ],
      }),
      ticket({ number: 30, title: 'Child 30', status: 'Done', epic: link }),
    ]);

    const review = section('Review');
    expect(
      within(review).getByRole('link', { name: 'Cockpit' }),
    ).toHaveAttribute('href', '/project/3/cycle/9?ticket=50');
    expect(within(review).getByRole('link', { name: 'PR #130' })).toBeVisible();
    expect(within(review).queryAllByRole('button')).toEqual([]);
  });

  it('offers no actions in Needs you, only links to the Tickets', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit();

    const needsYou = section('Needs you');
    expect(within(needsYou).queryAllByRole('button')).toEqual([]);
    expect(
      within(needsYou).getByRole('link', { name: 'Merge button' }),
    ).toHaveAttribute('href', '/project/3/cycle/9?ticket=8');
  });

  it('closes a Needs you group on its heading', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit();

    const review = section('Review');
    await userEvent.click(within(review).getByText('Review'));

    expect(review.querySelector('details')).not.toHaveAttribute('open');
  });

  it('says when nothing needs you', () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit([]);

    expect(
      within(section('Needs you')).getByText('Nothing needs you.'),
    ).toBeVisible();
  });

  it('puts the count back when the page replaces its title, and takes it off on leaving', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    document.title = 'Cockpit · Website | Tandembike';
    const { unmount } = renderCockpit();
    await vi.waitFor(() =>
      expect(document.title).toBe('(1) Cockpit · Website | Tandembike'),
    );

    // Next writes the page's metadata title again, as when a drawer opens.
    document.title = 'Cockpit · Website | Tandembike';

    await vi.waitFor(() =>
      expect(document.title).toBe('(1) Cockpit · Website | Tandembike'),
    );
    unmount();
    expect(document.title).toBe('Cockpit · Website | Tandembike');
  });

  it('puts the Needs you count in the tab title, and drops it at zero', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    document.title = 'Cockpit · Website | Tandembike';
    const { rerender } = renderCockpit();

    await vi.waitFor(() =>
      expect(document.title).toBe('(1) Cockpit · Website | Tandembike'),
    );

    rerender(
      <ConversationActivityProvider>
        <Cockpit
          projectId={3}
          cycle={{ id: 9, title: 'Factory Board' }}
          tickets={[]}
          runSlots={{ used: 1, cap: 3 }}
        />
      </ConversationActivityProvider>,
    );

    await vi.waitFor(() =>
      expect(document.title).toBe('Cockpit · Website | Tandembike'),
    );
  });

  it("opens a row's Ticket in a drawer over the Cockpit", async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit();

    expect(
      within(section('In flight')).getByRole('link', { name: 'Status line' }),
    ).toHaveAttribute('href', '/project/3/cycle/9?ticket=7');
  });

  it('keeps Your work, Queued and Done closed with their counts, and opens them on click', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit();

    const queued = section('Queued');
    expect(queued.querySelector('details')).not.toHaveAttribute('open');
    expect(within(queued).getByText('1')).toBeVisible();
    expect(within(section('Your work')).getByText('1')).toBeVisible();
    expect(within(section('Done')).getByText('1')).toBeVisible();

    await userEvent.click(within(queued).getByText('Queued'));

    expect(queued.querySelector('details')).toHaveAttribute('open');
    const [row] = within(queued).getAllByRole('listitem');
    expect(row).toHaveTextContent('Cache the Board');
    expect(row).toHaveTextContent('Queued #1 · blocked by T7');
    expect(within(row).getByText('Blocked')).toBeVisible();
  });

  it("follows a run's Conversation as it changes", async () => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.mocked(useRouter).mockReturnValue(mockRouter());
    vi.mocked(currentConversationActivity).mockResolvedValueOnce(
      activity({ live: { 7: liveConversation({ line: 'Reading a.ts' }) } }),
    );
    renderWithTheme(
      <LiveUpdates>
        <ConversationActivityProvider>
          <Cockpit
            projectId={3}
            cycle={{ id: 9, title: 'Factory Board' }}
            tickets={tickets}
            runSlots={{ used: 1, cap: 3 }}
          />
        </ConversationActivityProvider>
      </LiveUpdates>,
    );
    await vi.waitFor(() =>
      expect(screen.getByText(/^Reading a\.ts · /)).toBeVisible(),
    );

    vi.mocked(currentConversationActivity).mockResolvedValueOnce(
      activity({ live: { 7: liveConversation({ line: 'Editing b.ts' }) } }),
    );
    act(() => {
      FakeEventSource.instances[0]?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'conversation', id: 1 }),
        }),
      );
    });

    await vi.waitFor(() =>
      expect(screen.getByText(/^Editing b\.ts · /)).toBeVisible(),
    );
  });

  it('says when nothing is in flight', () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit([]);

    expect(
      within(section('In flight')).getByText('Nothing in flight.'),
    ).toBeVisible();
  });

  describe('selecting rows', () => {
    const cycle = (
      id: number,
      title: string,
      state: Cycle['state'],
    ): Cycle => ({
      id,
      projectId: 3,
      title,
      state,
      ticketNumbers: [],
      createdAt: new Date('2026-01-01'),
      archivedAt: null,
    });
    const epics = [
      ticket({ number: 20, title: 'Cockpit Epic', type: 'Epic' }),
      ticket({ number: 21, title: 'Other Epic', type: 'Epic' }),
    ];
    const queued = [
      ticket({ number: 30, title: 'First queued' }),
      ticket({ number: 31, title: 'Second queued' }),
      ticket({ number: 32, title: 'Third queued' }),
    ];
    const renderSelectable = () => {
      vi.mocked(currentConversationActivity).mockResolvedValue(
        noConversationActivity,
      );
      return renderWithTheme(
        <ConversationActivityProvider>
          <Cockpit
            projectId={3}
            cycle={{ id: 9, title: 'Factory Board' }}
            tickets={queued}
            cycles={[
              cycle(9, 'Factory Board', 'Active'),
              cycle(10, 'Next', 'Prepared'),
            ]}
            epics={epics}
            runSlots={{ used: 0, cap: 3 }}
          />
        </ConversationActivityProvider>,
      );
    };
    const box = (number: number, title: string) =>
      screen.getByRole('checkbox', { name: `Select T${number} ${title}` });
    const bar = () => screen.getByRole('toolbar', { name: 'Selection' });

    afterEach(() => {
      vi.mocked(moveTicketsToCycle).mockReset();
      vi.mocked(moveTicketsToEpic).mockReset();
      vi.mocked(archiveTickets).mockReset();
    });

    it('selects a row by its checkbox, by Cmd-click and by a Shift-click range', async () => {
      const user = userEvent.setup();
      renderSelectable();

      expect(screen.queryByRole('toolbar')).toBeNull();
      await user.click(box(30, 'First queued'));
      expect(bar()).toHaveTextContent('1 selected');

      await user.click(box(30, 'First queued'));
      expect(screen.queryByRole('toolbar')).toBeNull();

      await user.keyboard('{Meta>}');
      await user.click(screen.getByRole('link', { name: 'Second queued' }));
      await user.keyboard('{/Meta}');
      expect(bar()).toHaveTextContent('1 selected');
      expect(box(31, 'Second queued')).toBeChecked();
      expect(window.location.pathname).not.toContain('31');

      await user.keyboard('{Shift>}');
      await user.click(box(32, 'Third queued'));
      await user.keyboard('{/Shift}');
      expect(bar()).toHaveTextContent('2 selected');
      expect(box(32, 'Third queued')).toBeChecked();

      await user.click(within(bar()).getByRole('button', { name: 'Clear' }));
      expect(screen.queryByRole('toolbar')).toBeNull();
    });

    it('moves the selection to a Cycle and clears it', async () => {
      const user = userEvent.setup();
      vi.mocked(moveTicketsToCycle).mockResolvedValue({ ok: true, failed: [] });
      renderSelectable();
      await user.click(box(30, 'First queued'));
      await user.click(box(31, 'Second queued'));

      await user.click(
        within(bar()).getByRole('button', { name: 'Move to Cycle' }),
      );
      await user.click(screen.getByRole('menuitem', { name: 'Next' }));

      expect(moveTicketsToCycle).toHaveBeenCalledExactlyOnceWith({
        projectId: 3,
        cycleId: 10,
        ticketNumbers: [30, 31],
      });
      await vi.waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
    });

    it('moves the selection to the Backlog', async () => {
      const user = userEvent.setup();
      vi.mocked(moveTicketsToCycle).mockResolvedValue({ ok: true, failed: [] });
      renderSelectable();
      await user.click(box(30, 'First queued'));

      await user.click(
        within(bar()).getByRole('button', { name: 'Move to Cycle' }),
      );
      await user.click(screen.getByRole('menuitem', { name: 'Backlog' }));

      expect(moveTicketsToCycle).toHaveBeenCalledExactlyOnceWith({
        projectId: 3,
        cycleId: null,
        ticketNumbers: [30],
      });
    });

    it('lists the Tickets a move refused with their reasons and keeps only them selected', async () => {
      const user = userEvent.setup();
      vi.mocked(moveTicketsToCycle).mockResolvedValue({
        ok: true,
        failed: [{ number: 31, error: 'T31 is Done' }],
      });
      renderSelectable();
      await user.click(box(30, 'First queued'));
      await user.click(box(31, 'Second queued'));

      await user.click(
        within(bar()).getByRole('button', { name: 'Move to Cycle' }),
      );
      await user.click(screen.getByRole('menuitem', { name: 'Next' }));

      expect(await screen.findByText('T31 is Done')).toBeVisible();
      expect(bar()).toHaveTextContent('1 selected');
      expect(box(30, 'First queued')).not.toBeChecked();
      expect(box(31, 'Second queued')).toBeChecked();
    });

    it("adds the selection to the chosen Epic, listing the Project's Epics", async () => {
      const user = userEvent.setup();
      vi.mocked(moveTicketsToEpic).mockResolvedValue({ ok: true });
      renderSelectable();
      await user.click(box(30, 'First queued'));
      await user.click(box(32, 'Third queued'));

      await user.click(
        within(bar()).getByRole('button', { name: 'Add to Epic' }),
      );
      expect(
        screen.getAllByRole('menuitem').map((item) => item.textContent),
      ).toEqual(['T20 Cockpit Epic', 'T21 Other Epic']);
      await user.click(
        screen.getByRole('menuitem', { name: 'T21 Other Epic' }),
      );

      expect(moveTicketsToEpic).toHaveBeenCalledExactlyOnceWith({
        epic: 21,
        children: [30, 32],
      });
      await vi.waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
    });

    it('shows why adding to an Epic was refused and keeps the selection', async () => {
      const user = userEvent.setup();
      vi.mocked(moveTicketsToEpic).mockResolvedValue({
        ok: false,
        error: 'T30 is in another Project',
      });
      renderSelectable();
      await user.click(box(30, 'First queued'));

      await user.click(
        within(bar()).getByRole('button', { name: 'Add to Epic' }),
      );
      await user.click(
        screen.getByRole('menuitem', { name: 'T20 Cockpit Epic' }),
      );

      expect(
        await screen.findByText('T30 is in another Project'),
      ).toBeVisible();
      expect(bar()).toHaveTextContent('1 selected');
    });

    it('archives the selection', async () => {
      const user = userEvent.setup();
      vi.mocked(archiveTickets).mockResolvedValue({ ok: true });
      renderSelectable();
      await user.click(box(31, 'Second queued'));
      await user.click(box(30, 'First queued'));

      await user.click(within(bar()).getByRole('button', { name: 'Archive' }));

      expect(archiveTickets).toHaveBeenCalledExactlyOnceWith({
        ticketNumbers: [30, 31],
      });
      await vi.waitFor(() => expect(screen.queryByRole('toolbar')).toBeNull());
    });

    it('shows why an archive was refused and keeps the selection', async () => {
      const user = userEvent.setup();
      vi.mocked(archiveTickets).mockResolvedValue({
        ok: false,
        error: 'T30 has open children',
      });
      renderSelectable();
      await user.click(box(30, 'First queued'));

      await user.click(within(bar()).getByRole('button', { name: 'Archive' }));

      expect(await screen.findByText('T30 has open children')).toBeVisible();
      expect(bar()).toHaveTextContent('1 selected');
    });
  });
});
