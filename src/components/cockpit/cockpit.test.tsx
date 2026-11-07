import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { currentConversationActivity } from '../../app/conversations/actions';
import { noConversationActivity } from '../../conversations/conversation-activity';
import { activity, liveConversation } from '../../test/conversation-activity';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
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
        cycle={{ title: 'Factory Board' }}
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

    expect(screen.getByRole('heading', { name: 'Cockpit' })).toBeVisible();
    expect(screen.getByText('Factory Board · 1/5 done')).toBeVisible();
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

  it('offers no actions in Needs you, only links to the Tickets', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit();

    const needsYou = section('Needs you');
    expect(within(needsYou).queryAllByRole('button')).toEqual([]);
    expect(
      within(needsYou).getByRole('link', { name: 'Merge button' }),
    ).toHaveAttribute('href', '/project/3/cockpit?ticket=8');
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
          cycle={{ title: 'Factory Board' }}
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
    ).toHaveAttribute('href', '/project/3/cockpit?ticket=7');
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
            cycle={{ title: 'Factory Board' }}
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
});
