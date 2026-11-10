import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest';

import { currentConversationActivity } from '../../app/conversations/actions';
import { moveTicketsToCycle } from '../../app/cycles/actions';
import type { BoardFilter } from '../../app/lib/paths';
import {
  archiveTickets,
  createTicket,
  moveTicketsToEpic,
  reorderTickets,
} from '../../app/tickets/actions';
import { noConversationActivity } from '../../conversations/conversation-activity';
import { activity, liveConversation } from '../../test/conversation-activity';
import { keyboardDrag, stubDragAndDrop } from '../../test/drag-and-drop';
import { mockRouter } from '../../test/navigation';
import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import type { Cycle } from '../../tickets/cycles';
import type { Ticket } from '../../tickets/tickets';
import { ConversationActivityProvider } from '../conversation-activity/conversation-activity';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { LiveUpdates } from '../live-updates/live-updates';
import { Cockpit, emptyText } from './cockpit';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../conversation-dialog-provider/conversation-dialog-provider', () => ({
  useConversationDialog: vi.fn(),
}));
vi.mock('../../app/conversations/actions', () => ({
  currentConversationActivity: vi.fn(),
}));
vi.mock('../../app/cycles/actions', () => ({ moveTicketsToCycle: vi.fn() }));
vi.mock('../../app/tickets/actions', () => ({
  createTicket: vi.fn(),
  archiveTickets: vi.fn(),
  moveTicketsToEpic: vi.fn(),
  reorderTickets: vi.fn(),
}));
// The tests unstub globals when they finish.
beforeEach(stubDragAndDrop);

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

const renderCockpit = (shown: Ticket[] = tickets, filter?: BoardFilter) =>
  renderWithTheme(
    <ConversationActivityProvider>
      <Cockpit
        projectId={3}
        cycle={{ id: 9, title: 'Factory Board' }}
        tickets={shown}
        filter={filter}
        runSlots={{ used: 1, cap: 3 }}
      />
    </ConversationActivityProvider>,
  );

const section = (name: string) => screen.getByRole('region', { name });

/**
 * The links of a section's own rows, leaving out those of the children an
 * Epic row lists, which sit in a list item of their own inside the row's.
 */
const rowLinks = (region: HTMLElement) =>
  within(region)
    .getAllByRole('link')
    .filter((link) => !link.closest('li')?.parentElement?.closest('li'))
    .map((link) => link.textContent);

const dialog = { open: vi.fn() };
vi.mocked(useConversationDialog).mockReturnValue(
  dialog as unknown as ReturnType<typeof useConversationDialog>,
);

/** A section's buttons, but for each row's button that copies its number. */
const actionsIn = (element: HTMLElement) =>
  within(element)
    .queryAllByRole('button')
    .filter(
      (button) =>
        !button.getAttribute('aria-label')?.startsWith('Copy Ticket number'),
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

  it('shows a Terminal run In flight with its elapsed time and no cost (T1237)', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      activity({ live: { 7: liveConversation({ line: 'Starting' }) } }),
    );
    renderCockpit();

    const inFlight = section('In flight');
    await vi.waitFor(() =>
      expect(within(inFlight).getByText(/^Starting · [^$]+$/)).toBeVisible(),
    );
  });

  it('hides the cost of a handed-over Terminal run In flight (T1196)', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      activity({
        live: { 7: liveConversation({ line: 'Starting', terminal: true }) },
        cost: { 7: 1.5 },
      }),
    );
    renderCockpit();

    const inFlight = section('In flight');
    await vi.waitFor(() =>
      expect(within(inFlight).getByText(/^Starting · [^$]+$/)).toBeVisible(),
    );
    expect(within(inFlight).queryByText(/\$1\.50/)).not.toBeInTheDocument();
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

  it('marks an Intake row with a pending triage proposal', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderWithTheme(
      <ConversationActivityProvider>
        <Cockpit
          projectId={3}
          cycle={null}
          tickets={[
            ticket({ number: 20, title: 'Proposed', labels: ['needs-triage'] }),
            ticket({ number: 21, title: 'Plain', labels: ['needs-triage'] }),
          ]}
          proposedTriage={[20]}
          planning
        />
      </ConversationActivityProvider>,
    );

    const [proposed, plain] = within(section('Intake')).getAllByRole(
      'listitem',
    );
    expect(within(proposed).getByText('Triage proposed')).toBeVisible();
    expect(within(plain).queryByText('Triage proposed')).toBeNull();
  });

  it("shows the Cycle's Intake after Review, with each Ticket's triage label", async () => {
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
              position: 1,
            }),
            ticket({
              number: 20,
              title: 'Tag size missing',
              labels: ['needs-triage'],
              createdAt: new Date('2026-11-01'),
              position: 2,
            }),
          ]}
          runSlots={{ used: 1, cap: 3 }}
        />
      </ConversationActivityProvider>,
    );

    const intake = section('Intake');
    expect(intake.querySelector('details')).toHaveAttribute('open');
    // In Board order.
    const [planned, filed] = within(intake).getAllByRole('listitem');
    expect(
      within(filed).getByRole('link', { name: 'Tag size missing' }),
    ).toHaveAttribute('href', '/project/3/cycle/9?ticket=20');
    expect(filed).toHaveTextContent(/Intake · to triage · /);
    expect(within(filed).getByText('needs-triage')).toBeVisible();
    expect(within(planned).getByText('no triage label')).toBeVisible();
    expect(within(section('Needs you')).getAllByText('3')[0]).toBeVisible();
  });

  it("shows each row's labels in every section, leaving out the state labels", async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderWithTheme(
      <ConversationActivityProvider>
        <Cockpit
          projectId={3}
          cycle={{ id: 9, title: 'Factory Board' }}
          tickets={[
            ticket({
              number: 20,
              title: 'Filed bug',
              labels: ['needs-triage', 'bug', 'from:tandembike'],
            }),
            ticket({
              number: 7,
              title: 'Status line',
              status: 'In progress',
              claim,
              labels: ['enhancement'],
            }),
            ticket({
              number: 9,
              title: 'Pick a ceiling',
              labels: ['ready-for-human', 'docs'],
            }),
            ticket({
              number: 10,
              title: 'Cache the Board',
              labels: ['ready-for-agent', 'performance'],
            }),
            ticket({
              number: 11,
              title: 'Old work',
              status: 'Done',
              labels: ['bug', 'wontfix'],
            }),
          ]}
          archived={[
            ticket({
              number: 14,
              title: 'Gone',
              archived: true,
              labels: ['wontfix', 'idea'],
            }),
          ]}
          runSlots={{ used: 1, cap: 3 }}
        />
      </ConversationActivityProvider>,
    );

    const labelsIn = (name: string) =>
      within(section(name))
        .getAllByRole('list', { name: 'Labels' })
        .map((list) =>
          within(list)
            .getAllByRole('listitem')
            .map((item) => item.textContent),
        );
    expect(labelsIn('Intake')).toEqual([['bug', 'from:tandembike']]);
    expect(labelsIn('In flight')).toEqual([['enhancement']]);
    expect(labelsIn('Your work')).toEqual([['docs']]);
    expect(labelsIn('Queued')).toEqual([['performance']]);
    expect(labelsIn('Done')).toEqual([['bug']]);
    expect(labelsIn('Archived')).toEqual([['idea']]);
    // Intake keeps its triage tag, after the labels, and shows it once.
    const intakeRow = within(section('Intake')).getAllByRole('listitem')[0];
    expect(within(intakeRow).getAllByText('needs-triage')).toHaveLength(1);
    expect(
      within(intakeRow)
        .getByText('bug')
        .compareDocumentPosition(within(intakeRow).getByText('needs-triage')),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // Label tags are not links or buttons.
    for (const list of screen.getAllByRole('list', { name: 'Labels' })) {
      expect(within(list).queryByRole('link')).not.toBeInTheDocument();
      expect(within(list).queryByRole('button')).not.toBeInTheDocument();
    }
  });

  it('shows at most two labels on a row, then a tag naming the rest', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit([
      ticket({
        number: 7,
        title: 'Status line',
        status: 'In progress',
        claim,
        labels: ['bug', 'ui', 'from:agent-run', 'docs'],
      }),
    ]);

    const list = within(section('In flight')).getByRole('list', {
      name: 'Labels',
    });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['bug', 'ui', '+2']);
    expect(items[2]).toHaveAccessibleName(
      '2 more labels: from:agent-run, docs',
    );
    expect(items[2]).toHaveAttribute('title', 'from:agent-run, docs');
  });

  it('renders no label list on a row without labels to show', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit();

    expect(
      screen.queryByRole('list', { name: 'Labels' }),
    ).not.toBeInTheDocument();
  });

  it('says an Intake Epic without children is ready for an Agent once split (T1139)', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit([
      ticket({
        number: 52,
        title: 'Spec',
        type: 'Epic',
        color: 'teal',
        labels: ['ready-for-agent'],
      }),
      ticket({
        number: 53,
        title: 'Hand-made',
        type: 'Epic',
        color: 'amber',
        labels: ['needs-triage'],
      }),
    ]);

    const intake = section('Intake');
    expect(rowLinks(intake)).toEqual(['Spec', 'Hand-made']);
    expect(
      within(section('Queued')).queryByRole('link', { name: 'Spec' }),
    ).toBeNull();
    const [spec, handMade] = within(intake).getAllByRole('listitem');
    await userEvent.click(spec.querySelector('summary') as HTMLElement);
    await userEvent.click(handMade.querySelector('summary') as HTMLElement);

    expect(
      within(spec).getByText(
        'Ready for an Agent once split: no children yet. Triage it to split it.',
      ),
    ).toBeVisible();
    expect(within(handMade).getByText('No children yet')).toBeVisible();
  });

  it("shows an In progress Epic In flight with its children's progress, opening to list them", async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      activity({
        cost: { 50: 1, 31: 0.5 },
        live: { 32: liveConversation({ state: 'waiting' }) },
      }),
    );
    const link = {
      number: 50,
      title: 'Cockpit',
      color: 'teal' as const,
      claim,
      hasPullRequest: false,
    };
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
      within(epicRow).getByRole('img', {
        name: '1 of 3 children done or built',
      }),
    ).toBeVisible();
    const summary = epicRow.querySelector('summary') as HTMLElement;
    expect(within(summary).getByText('needs you')).toBeVisible();
    expect(within(summary).getByText('Running')).toBeVisible();
    expect(rowLinks(inFlight)).not.toContain('Child 31');

    await userEvent.click(
      within(epicRow).getByRole('img', {
        name: '1 of 3 children done or built',
      }),
    );

    expect(epicRow.querySelector('details')).toHaveAttribute('open');
    expect(
      within(epicRow)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual([
      'T30Child 30done',
      'T31Child 31started',
      'T32Child 32needs you',
    ]);
    const childList = within(epicRow).getByRole('list');
    expect(
      within(childList).getByRole('link', { name: 'Child 31' }),
    ).toHaveAttribute('href', '/project/3/cycle/9?ticket=31');
    // Only the title links; the number, pip and state stay plain text.
    expect(
      within(childList)
        .getAllByRole('link')
        .map((child) => child.textContent),
    ).toEqual(['Child 30', 'Child 31', 'Child 32']);
    expect(
      within(section('Action needed')).getByRole('link', { name: 'Child 32' }),
    ).toBeVisible();
  });

  it("counts an Epic's built children with its done ones, telling them apart (T1144)", async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    const link = {
      number: 50,
      title: 'Cockpit',
      color: 'teal' as const,
      claim,
      hasPullRequest: false,
    };
    const childOf = (number: number, status: Ticket['status']) => ({
      number,
      title: `Child ${number}`,
      status,
      archived: false,
      blockedBy: [],
      blocked: false,
    });
    const checked = [{ id: 1, text: 'Works', checked: true }];
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
        epic: link,
        acceptanceCriteria: checked,
      }),
      ticket({
        number: 32,
        title: 'Child 32',
        status: 'In progress',
        epic: link,
      }),
    ]);

    const epicRow = within(section('In flight'))
      .getByRole('link', { name: 'Cockpit' })
      .closest('li') as HTMLElement;
    const bar = within(epicRow).getByRole('img', {
      name: '2 of 3 children done or built',
    });
    expect(bar).toHaveTextContent('2/3');

    await userEvent.click(bar);

    expect(
      within(epicRow)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['T30Child 30done', 'T31Child 31built', 'T32Child 32started']);
  });

  it("links an opened Epic row's children over this Board, keeping its filter", async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    const link = {
      number: 50,
      title: 'Cockpit',
      color: 'teal' as const,
      claim: null,
      hasPullRequest: false,
    };
    renderCockpit(
      [
        ticket({
          number: 50,
          title: 'Cockpit',
          type: 'Epic',
          color: 'teal',
          labels: ['ready-for-agent'],
          children: [
            {
              number: 30,
              title: 'Child 30',
              status: 'Todo',
              archived: false,
              blockedBy: [],
              blocked: false,
            },
          ],
        }),
        ticket({
          number: 30,
          title: 'Child 30',
          labels: ['ready-for-agent'],
          epic: link,
        }),
      ],
      { query: 'Child', labels: [] },
    );

    const epicRow = within(section('Queued'))
      .getByRole('link', { name: 'Cockpit' })
      .closest('li') as HTMLElement;
    await userEvent.click(
      within(epicRow).getByRole('img', {
        name: '0 of 1 children done or built',
      }),
    );

    expect(
      within(within(epicRow).getByRole('list')).getByRole('link', {
        name: 'Child 30',
      }),
    ).toHaveAttribute('href', '/project/3/cycle/9?q=Child&ticket=30');
  });

  it('puts an Epic in Review in Needs you, opening the Epic, with no Merged button', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    const link = {
      number: 50,
      title: 'Cockpit',
      color: 'teal' as const,
      claim: null,
      hasPullRequest: false,
    };
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
    expect(actionsIn(review)).toEqual([]);
    // Listed once: In flight holds Running work only.
    expect(screen.getAllByRole('link', { name: 'Cockpit' })).toHaveLength(1);
    expect(screen.getByText(emptyText.inFlight)).toBeVisible();
  });

  it('shows an Epic in Intake as an expandable row of Needs you > Intake, its children nested and counted once', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    const link = {
      number: 50,
      title: 'Big idea',
      color: 'teal' as const,
      claim: null,
      hasPullRequest: false,
    };
    renderCockpit([
      ticket({
        number: 50,
        title: 'Big idea',
        type: 'Epic',
        color: 'teal',
        children: [
          {
            number: 30,
            title: 'Child 30',
            status: 'Todo',
            archived: false,
            blockedBy: [],
            blocked: false,
          },
        ],
      }),
      ticket({ number: 30, title: 'Child 30', epic: link }),
    ]);

    const intake = section('Intake');
    const row = within(intake)
      .getByRole('link', { name: 'Big idea' })
      .closest('li') as HTMLElement;
    expect(rowLinks(intake)).toEqual(['Big idea']);
    expect(within(row).queryAllByRole('checkbox')).toHaveLength(0);
    await userEvent.click(
      within(row).getByRole('img', { name: '0 of 1 children done or built' }),
    );
    expect(row.querySelector('details')).toHaveAttribute('open');
    expect(within(row).getByText('Child 30')).toBeVisible();
    expect(within(section('Needs you')).getAllByText('1')[0]).toBeVisible();
  });

  it('offers no actions in Needs you, only links to the Tickets', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit();

    const needsYou = section('Needs you');
    expect(actionsIn(needsYou)).toEqual([]);
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
      within(section('Needs you')).getByText(emptyText.needsYou),
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

  it('shows its sections in the order Needs you, In flight, Your work, Queued, Done, Archived', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit();

    const boardSections = [
      'Needs you',
      'In flight',
      'Your work',
      'Queued',
      'Done',
      'Archived',
    ];
    expect(
      screen
        .getAllByRole('region')
        .map((region) => region.getAttribute('aria-label'))
        .filter((name) => name !== null && boardSections.includes(name)),
    ).toEqual(boardSections);
  });

  it('keeps Your work, Queued and Done closed with their counts, and opens them on click', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit();

    const yourWork = section('Your work');
    expect(yourWork.querySelector('details')).not.toHaveAttribute('open');
    expect(within(yourWork).getByText('1')).toBeVisible();
    const queued = section('Queued');
    expect(queued.querySelector('details')).not.toHaveAttribute('open');
    expect(within(queued).getByText('1')).toBeVisible();
    const done = section('Done');
    expect(done.querySelector('details')).not.toHaveAttribute('open');
    expect(within(done).getByText('1')).toBeVisible();

    await userEvent.click(
      within(queued).getByText('Queued', { selector: 'summary span' }),
    );

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

  it('highlights the row of a changed Ticket for a moment, in every section', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.mocked(useRouter).mockReturnValue(mockRouter());
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    const shown = [
      ...tickets,
      ticket({ number: 12, title: 'Untriaged idea' }),
      ticket({ number: 13, title: 'Mine', labels: ['ready-for-human'] }),
    ];
    const archived = [ticket({ number: 14, title: 'Gone', archived: true })];
    renderWithTheme(
      <LiveUpdates>
        <ConversationActivityProvider>
          <Cockpit
            projectId={3}
            cycle={{ id: 9, title: 'Factory Board' }}
            tickets={shown}
            archived={archived}
            runSlots={{ used: 1, cap: 3 }}
          />
        </ConversationActivityProvider>
      </LiveUpdates>,
    );
    const titles = [...shown, ...archived].map(({ title }) => title);
    const row = (title: string) =>
      screen.getByRole('link', { name: title, hidden: true }).closest('li');

    act(() => {
      FakeEventSource.instances[0]?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'ticket', number: 9 }),
        }),
      );
    });
    expect(row('Pick a ceiling')).toHaveAttribute('data-changed');
    expect(row('Old work')).not.toHaveAttribute('data-changed');

    act(() => {
      FakeEventSource.instances[0]?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'tickets',
            numbers: [...shown, ...archived].map(({ number }) => number),
          }),
        }),
      );
    });
    for (const title of titles) {
      expect(row(title), title).toHaveAttribute('data-changed');
    }

    act(() => vi.advanceTimersByTime(2000));
    for (const title of titles) {
      expect(row(title), title).not.toHaveAttribute('data-changed');
    }
  });

  it('says what belongs in each empty section and how work gets there', () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit([]);

    expect(
      within(section('Queued')).getByText(
        'Queued is empty: triage a Ticket as ready-for-agent to queue it.',
      ),
    ).toBeVisible();
    expect(
      within(section('Your work')).getByText(emptyText.yourWork),
    ).toBeVisible();
    expect(within(section('Done')).getByText(emptyText.done)).toBeVisible();
  });

  it('links the Board to how its Project runs', () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit([]);

    expect(
      screen.getByRole('link', { name: 'How this Project runs' }),
    ).toHaveAttribute('href', '/project/3/flow');
  });

  it('says when nothing is in flight', () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit([]);

    expect(
      within(section('In flight')).getByText(emptyText.inFlight),
    ).toBeVisible();
  });

  it('shows a ready-for-agent Epic in Queued and a Done one in Done, each with its children nested', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    const link = {
      number: 50,
      title: 'Cockpit',
      color: 'teal' as const,
      claim: null,
      hasPullRequest: false,
    };
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
        labels: ['ready-for-agent'],
        children: [childOf(30, 'Todo')],
      }),
      ticket({
        number: 30,
        title: 'Child 30',
        labels: ['ready-for-agent'],
        epic: link,
      }),
      ticket({
        number: 70,
        title: 'Plain queued',
        position: 5,
        labels: ['ready-for-agent'],
      }),
      ticket({
        number: 60,
        title: 'Shipped',
        type: 'Epic',
        color: 'pink',
        status: 'Done',
        children: [childOf(31, 'Done')],
      }),
      ticket({
        number: 31,
        title: 'Child 31',
        status: 'Done',
        epic: {
          number: 60,
          title: 'Shipped',
          color: 'pink',
          claim: null,
          hasPullRequest: false,
        },
      }),
    ]);

    const queued = section('Queued');
    expect(rowLinks(queued)).toHaveLength(2);
    expect(
      within(queued).getByRole('checkbox', { name: 'Select T70 Plain queued' }),
    ).toBeInTheDocument();
    const epicRow = within(queued)
      .getByRole('link', { name: 'Cockpit' })
      .closest('li') as HTMLElement;
    await userEvent.click(
      within(epicRow).getByRole('img', {
        name: '0 of 1 children done or built',
      }),
    );
    expect(epicRow.querySelector('details')).toHaveAttribute('open');
    expect(within(epicRow).queryAllByRole('checkbox')).toHaveLength(0);
    expect(within(epicRow).getByText('Child 30')).toBeInTheDocument();
    const done = section('Done');
    expect(
      within(done).getByRole('link', { name: 'Shipped' }),
    ).toBeInTheDocument();
    expect(rowLinks(done)).not.toContain('Child 31');
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

    it("copies a row's number on a plain click, without opening the drawer", async () => {
      const user = userEvent.setup();
      const router = mockRouter();
      vi.mocked(useRouter).mockReturnValue(router);
      renderSelectable();
      const { href } = window.location;

      const copyButton = screen.getByRole('button', {
        name: 'Copy Ticket number T31',
      });
      await user.click(copyButton);

      expect(await navigator.clipboard.readText()).toBe('T31');
      const row = copyButton.closest('li') as HTMLElement;
      expect(within(row).getByRole('status')).toHaveTextContent('Copied T31');
      expect(window.location.href).toBe(href);
      expect(router.push).not.toHaveBeenCalled();
      expect(screen.queryByRole('toolbar')).toBeNull();
    });

    it('selects a row by a Cmd-click or Shift-click on its number, without copying', async () => {
      const user = userEvent.setup();
      renderSelectable();
      const writeText = vi.spyOn(navigator.clipboard, 'writeText');

      await user.keyboard('{Meta>}');
      await user.click(
        screen.getByRole('button', { name: 'Copy Ticket number T30' }),
      );
      await user.keyboard('{/Meta}');
      expect(box(30, 'First queued')).toBeChecked();

      await user.keyboard('{Shift>}');
      await user.click(
        screen.getByRole('button', { name: 'Copy Ticket number T32' }),
      );
      await user.keyboard('{/Shift}');
      expect(bar()).toHaveTextContent('3 selected');
      expect(writeText).not.toHaveBeenCalled();
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

describe('Cockpit drag', () => {
  const cycle = { id: 9, title: 'Factory Board', state: 'Active' as const };
  const planned = (
    fields: Partial<Ticket> & Pick<Ticket, 'number' | 'title'>,
  ) => ticket({ cycle, ...fields });

  /** Lays the rows out one under another, in the order of the page. */
  const mockRowBounds = () => {
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.tagName === 'LI') {
          const rows = [...document.querySelectorAll('li')];
          return new DOMRect(
            0,
            50 + rows.indexOf(this as never) * 100,
            100,
            80,
          );
        }
        return new DOMRect(0, 0, 800, 2000);
      });
    onTestFinished(() => bounds.mockRestore());
  };

  const rowOf = (number: number) => {
    const row = screen.getByText(`T${number}`).closest('li');
    if (!row) {
      throw new Error(`No row for T${number}`);
    }
    return row;
  };

  const dragged = [
    planned({ number: 1, title: 'First queued', labels: ['ready-for-agent'] }),
    planned({
      number: 2,
      title: 'Second queued',
      position: 1,
      labels: ['ready-for-agent'],
    }),
    planned({
      number: 3,
      title: 'Third queued',
      position: 2,
      labels: ['ready-for-agent'],
    }),
    planned({
      number: 4,
      title: 'Mine one',
      position: 3,
      labels: ['ready-for-human'],
    }),
    planned({
      number: 5,
      title: 'Mine two',
      position: 4,
      labels: ['ready-for-human'],
    }),
    planned({ number: 6, title: 'Idea one', position: 5 }),
    planned({ number: 7, title: 'Idea two', position: 6 }),
    planned({ number: 8, title: 'Old work', status: 'Done' }),
  ];

  const rowsIn = (name: string) =>
    within(section(name))
      .getAllByRole('listitem')
      .map((row) => within(row).getAllByRole('link')[0].textContent);

  const renderDraggable = () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    mockRowBounds();
    renderCockpit(dragged);
  };

  afterEach(() => {
    vi.mocked(reorderTickets).mockReset();
    vi.mocked(currentConversationActivity).mockReset();
  });

  it.each([
    ['Queued', 1, '{ArrowDown}', [2, 1, 3, 4, 5, 6, 7]],
    ['Your work', 5, '{ArrowUp}', [5, 1, 2, 3, 4, 6, 7]],
    ['Intake', 6, '{ArrowDown}', [1, 2, 3, 4, 5, 7, 6]],
  ])(
    'reorders a row dragged within %s by keyboard, saving the order of the Todo Tickets',
    async (_name, number, keys, ticketNumbers) => {
      const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
      vi.mocked(reorderTickets).mockReturnValue(promise);
      onTestFinished(async () => {
        await act(async () => resolve({ ok: true }));
      });
      renderDraggable();

      await keyboardDrag(rowOf(number), keys);

      await vi.waitFor(() =>
        expect(reorderTickets).toHaveBeenCalledExactlyOnceWith({
          projectId: 3,
          status: 'Todo',
          cycleId: 9,
          ticketNumbers,
        }),
      );
    },
  );

  it('leaves an Epic of another Cycle out of the order it saves', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(reorderTickets).mockReturnValue(promise);
    onTestFinished(async () => {
      await act(async () => resolve({ ok: true }));
    });
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    mockRowBounds();
    renderCockpit([
      planned({
        number: 1,
        title: 'First queued',
        labels: ['ready-for-agent'],
      }),
      ticket({
        number: 50,
        title: 'Foreign epic',
        type: 'Epic',
        color: 'teal',
        position: 1,
        labels: ['ready-for-agent'],
        cycle: { id: 10, title: 'Elsewhere', state: 'Prepared' },
      }),
      planned({
        number: 2,
        title: 'Second queued',
        position: 2,
        labels: ['ready-for-agent'],
      }),
    ]);

    await keyboardDrag(rowOf(1), '{ArrowDown}');

    await vi.waitFor(() =>
      expect(reorderTickets).toHaveBeenCalledExactlyOnceWith({
        projectId: 3,
        status: 'Todo',
        cycleId: 9,
        ticketNumbers: [2, 1],
      }),
    );
  });

  it('shows a reordered row in its new place at once', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(reorderTickets).mockReturnValue(promise);
    onTestFinished(async () => {
      await act(async () => resolve({ ok: true }));
    });
    renderDraggable();

    await keyboardDrag(rowOf(1), '{ArrowDown}');

    await vi.waitFor(() =>
      expect(rowsIn('Queued')).toEqual([
        'Second queued',
        'First queued',
        'Third queued',
      ]),
    );
  });

  it('changes nothing for a row dropped in another section', async () => {
    renderDraggable();

    // The first Queued row's neighbour above is the last of Your work.
    await keyboardDrag(rowOf(1), '{ArrowUp}');

    expect(reorderTickets).not.toHaveBeenCalled();
    expect(rowsIn('Queued')).toEqual([
      'First queued',
      'Second queued',
      'Third queued',
    ]);
  });

  it('drags a selection within one section together, in Board order', async () => {
    const { promise, resolve } = Promise.withResolvers<{ ok: true }>();
    vi.mocked(reorderTickets).mockReturnValue(promise);
    onTestFinished(async () => {
      await act(async () => resolve({ ok: true }));
    });
    renderDraggable();
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select T1 First queued' }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select T2 Second queued' }),
    );

    // Dragged by its second row onto the third, the pair lands after it in
    // Board order. One step keeps the drop inside Queued, which Your work
    // follows.
    await keyboardDrag(rowOf(2), '{ArrowDown}');

    await vi.waitFor(() =>
      expect(reorderTickets).toHaveBeenCalledExactlyOnceWith({
        projectId: 3,
        status: 'Todo',
        cycleId: 9,
        ticketNumbers: [3, 1, 2, 4, 5, 6, 7],
      }),
    );
  });

  it('cannot drag a selection that spans sections', async () => {
    renderDraggable();
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select T1 First queued' }),
    );
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select T4 Mine one' }),
    );

    await keyboardDrag(rowOf(1), '{ArrowDown}');

    expect(reorderTickets).not.toHaveBeenCalled();
    expect(rowsIn('Queued')).toEqual([
      'First queued',
      'Second queued',
      'Third queued',
    ]);
  });

  it('cannot drag a Done row or a Needs you row, only the rows a drag orders', async () => {
    renderDraggable();

    await vi.waitFor(() =>
      expect(rowOf(6)).toHaveAttribute('aria-roledescription', 'draggable'),
    );
    expect(rowOf(1)).toHaveAttribute('aria-roledescription', 'draggable');
    expect(rowOf(4)).toHaveAttribute('aria-roledescription', 'draggable');
    expect(rowOf(8)).not.toHaveAttribute('aria-roledescription');
  });

  it('cannot drag a Review row', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    renderCockpit([
      ...dragged,
      planned({
        number: 9,
        title: 'In review',
        status: 'In progress',
        externalReferences: ['https://github.com/owner/repo/pull/9'],
      }),
    ]);

    await vi.waitFor(() =>
      expect(rowOf(6)).toHaveAttribute('aria-roledescription', 'draggable'),
    );
    expect(rowOf(9)).not.toHaveAttribute('aria-roledescription');
  });
});

describe('Cockpit New Ticket field and Board filter (T1118)', () => {
  afterEach(() => {
    vi.mocked(createTicket).mockReset();
    window.history.replaceState(null, '', '/');
  });

  const quiet = () =>
    vi
      .mocked(currentConversationActivity)
      .mockResolvedValue(noConversationActivity);

  it("creates a Ticket in the Board's Cycle with no state label, so it lands in Intake", async () => {
    quiet();
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderCockpit();

    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Ticket title' }),
      'Fix the header{Enter}',
    );

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      title: 'Fix the header',
      cycleId: 9,
    });
  });

  it('narrows every section to the Tickets matching the search, with filtered counts', async () => {
    quiet();
    renderCockpit(tickets, { query: 'merge', labels: [] });

    expect(within(section('Review')).getByText('Merge button')).toBeVisible();
    expect(screen.queryByText('Status line')).not.toBeInTheDocument();
    expect(screen.queryByText('Pick a ceiling')).not.toBeInTheDocument();
    expect(within(section('Queued')).queryByText('Cache the Board')).toBeNull();
    expect(
      within(section('Queued')).getByText('0', { selector: 'span' }),
    ).toBeVisible();
    expect(within(section('Review')).getByText('1')).toBeVisible();
  });

  it('narrows by Label from the URL on load', () => {
    quiet();
    renderCockpit(tickets, { query: '', labels: ['ready-for-human'] });

    expect(screen.getByText('Pick a ceiling')).toBeInTheDocument();
    expect(screen.queryByText('Merge button')).not.toBeInTheDocument();
  });

  it('filters as the search is typed, and writes it to the URL', async () => {
    quiet();
    renderCockpit();

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search Tickets' }),
      'ceiling',
    );

    expect(screen.getByText('Pick a ceiling')).toBeInTheDocument();
    expect(screen.queryByText('Merge button')).not.toBeInTheDocument();
    await vi.waitFor(() => expect(window.location.search).toBe('?q=ceiling'));
  });

  it('keeps the Needs you count in the tab title unfiltered', async () => {
    quiet();
    document.title = 'Board | Tandembike';
    renderCockpit(tickets, { query: 'nothing matches this', labels: [] });

    await vi.waitFor(() =>
      expect(document.title).toBe('(1) Board | Tandembike'),
    );
  });
});

describe('Cockpit as a planning Board (T1119)', () => {
  const quiet = () =>
    vi
      .mocked(currentConversationActivity)
      .mockResolvedValue(noConversationActivity);

  afterEach(() => {
    vi.mocked(createTicket).mockReset();
    vi.mocked(reorderTickets).mockReset();
    vi.mocked(currentConversationActivity).mockReset();
  });

  const planning = [
    ticket({ number: 1, title: 'Queued one', labels: ['ready-for-agent'] }),
    ticket({
      number: 2,
      title: 'Queued two',
      position: 1,
      labels: ['ready-for-agent'],
    }),
    ticket({
      number: 3,
      title: 'Mine',
      position: 2,
      labels: ['ready-for-human'],
    }),
  ];

  const renderPlanning = (props: Partial<Parameters<typeof Cockpit>[0]> = {}) =>
    renderWithTheme(
      <ConversationActivityProvider>
        <Cockpit
          projectId={3}
          cycle={{ id: 9, title: 'Next' }}
          tickets={planning}
          planning
          {...props}
        />
      </ConversationActivityProvider>,
    );

  it("shows a Prepared Cycle's progress without run slots", () => {
    quiet();
    renderPlanning();

    expect(screen.getByText('0/3 done')).toBeVisible();
    expect(
      screen.getByRole('progressbar', { name: 'Cycle progress' }),
    ).toBeVisible();
    expect(screen.queryByText(/^Runs /)).not.toBeInTheDocument();
  });

  it('shows no progress on the Backlog', () => {
    quiet();
    renderPlanning({ cycle: null });

    expect(screen.queryByText(/done$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('starts Queued and Your work open, and Done closed, and hides empty sections', () => {
    quiet();
    renderPlanning({
      tickets: [
        ...planning,
        ticket({ number: 4, title: 'Old', status: 'Done' }),
      ],
    });

    expect(section('Queued').querySelector('details')).toHaveAttribute('open');
    expect(section('Your work').querySelector('details')).toHaveAttribute(
      'open',
    );
    expect(section('Done').querySelector('details')).not.toHaveAttribute(
      'open',
    );
    expect(screen.queryByRole('region', { name: 'In flight' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Needs you' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Archived' })).toBeNull();
  });

  it('hides Queued and Your work when they are empty', () => {
    quiet();
    renderPlanning({ tickets: [planning[0]] });

    expect(screen.queryByRole('region', { name: 'Your work' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Done' })).toBeNull();
    expect(section('Queued')).toBeVisible();
  });

  it('creates a Backlog Ticket outside any Cycle', async () => {
    quiet();
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderPlanning({ cycle: null });

    await userEvent.type(
      screen.getByRole('textbox', { name: 'New Ticket title' }),
      'Idea{Enter}',
    );

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      title: 'Idea',
    });
  });

  it("reorders the Backlog's Queued rows with no Cycle", async () => {
    quiet();
    vi.mocked(reorderTickets).mockResolvedValue({ ok: true });
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.tagName === 'LI') {
          const rows = [...document.querySelectorAll('li')];
          return new DOMRect(
            0,
            50 + rows.indexOf(this as never) * 100,
            100,
            80,
          );
        }
        return new DOMRect(0, 0, 800, 2000);
      });
    onTestFinished(() => bounds.mockRestore());
    renderPlanning({ cycle: null });
    const row = screen.getByText('T1').closest('li');
    if (!row) {
      throw new Error('No row');
    }

    await keyboardDrag(row, '{ArrowDown}');

    await vi.waitFor(() =>
      expect(reorderTickets).toHaveBeenCalledExactlyOnceWith({
        projectId: 3,
        status: 'Todo',
        cycleId: null,
        ticketNumbers: [2, 1, 3],
      }),
    );
  });

  it('offers a Backlog selection a move to a Cycle but not to the Backlog', async () => {
    quiet();
    const next: Cycle = {
      id: 9,
      projectId: 3,
      title: 'Next',
      state: 'Prepared',
    } as Cycle;
    renderPlanning({ cycle: null, cycles: [next] });

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Select T1 Queued one' }),
    );

    expect(screen.getByText('1 selected')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /Move to/ }));
    expect(screen.getByRole('menuitem', { name: 'Next' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Backlog' })).toBeNull();
  });

  it('lists the archived Tickets last, closed, each opening its Ticket', async () => {
    quiet();
    renderPlanning({
      archived: [ticket({ number: 20, title: 'Dropped', archived: true })],
    });

    const archived = section('Archived');
    expect(archived.querySelector('details')).not.toHaveAttribute('open');
    expect(within(archived).getByText('1')).toBeVisible();
    const regions = screen.getAllByRole('region');
    expect(regions.at(-1)).toBe(archived);
    await userEvent.click(within(archived).getByText('Archived'));
    expect(
      within(archived).getByRole('link', { name: /Dropped/ }),
    ).toHaveAttribute('href', expect.stringContaining('ticket=20'));
  });

  it('shows the Archived list on the Active Cycle, even with none', () => {
    quiet();
    renderCockpit();

    expect(section('Archived')).toBeVisible();
  });
});
