import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentConversationActivity } from '../../app/conversations/actions';
import { completeTicket } from '../../app/tickets/actions';
import { noConversationActivity } from '../../conversations/conversation-activity';
import { activity, liveConversation } from '../../test/conversation-activity';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import type { EpicChild, Ticket } from '../../tickets/tickets';
import { ConversationActivityProvider } from '../conversation-activity/conversation-activity';
import { LiveUpdates } from '../live-updates/live-updates';
import { Board } from './board';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../../app/conversations/actions', () => ({
  currentConversationActivity: vi.fn(),
}));
vi.mock('../../app/cycles/actions', () => ({ moveTicketsToCycle: vi.fn() }));
vi.mock('../../app/projects/actions', () => ({
  renameProject: vi.fn(),
  styleProject: vi.fn(),
}));
vi.mock('../../app/tickets/actions', () => ({
  archiveTickets: vi.fn(),
  completeTicket: vi.fn(),
  createTicket: vi.fn(),
  moveTickets: vi.fn(),
  moveTicketsToEpic: vi.fn(),
  reorderTickets: vi.fn(),
  updateTicket: vi.fn(),
}));

class FakeEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
}

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
  status: 'In progress',
  projectId: project.id,
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

const epicLink = { number: 20, title: 'Checkout', color: 'teal' as const };

const childOf = (number: number): EpicChild => ({
  number,
  title: `Child ${number}`,
  status: 'In progress',
  archived: false,
  blockedBy: [],
  blocked: false,
});

const childTicket = (number: number) =>
  ticket({
    number,
    title: `Child ${number}`,
    epic: epicLink,
    labels: ['ready-for-agent'],
  });

const inReviewEpic = ticket({
  number: 20,
  title: 'Checkout',
  type: 'Epic',
  color: 'teal',
  labels: ['ready-for-agent'],
  externalReferences: ['https://github.com/owner/repo/pull/87'],
  children: [childOf(21), childOf(22)],
});

const runningActivity = activity({
  live: { 20: liveConversation({ line: 'Editing checkout.tsx' }) },
});

const renderBoard = () =>
  renderWithTheme(
    <LiveUpdates>
      <ConversationActivityProvider>
        <Board
          project={project}
          tickets={[childTicket(21), childTicket(22)]}
          epics={[inReviewEpic]}
        />
      </ConversationActivityProvider>
    </LiveUpdates>,
  );

const merged = () =>
  screen.getByRole('button', { name: 'Merged T20 Checkout' });

describe('Board Epic row with live state', () => {
  beforeEach(() => {
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.mocked(useRouter).mockReturnValue(mockRouter());
    vi.mocked(currentConversationActivity).mockResolvedValue(
      noConversationActivity,
    );
    vi.mocked(completeTicket).mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an Epic's live Conversation as its badge and status line", async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue(runningActivity);
    renderBoard();

    expect(await screen.findByText('Editing checkout.tsx')).toBeInTheDocument();
    const row = screen.getByRole('list', { name: 'Epics' });
    expect(within(row).getByText('Running')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Merged T20 Checkout' }),
    ).not.toBeInTheDocument();
  });

  it('completes the Epic and its children when Merged is clicked', async () => {
    let finish: (result: { ok: true; projectId: number }) => void = () => {};
    vi.mocked(completeTicket).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderBoard();

    await userEvent.click(merged());

    expect(completeTicket).toHaveBeenCalledWith({ number: 20 });
    // Optimistically: the Epic is Done and hidden, its children are Done.
    expect(
      screen.queryByRole('button', { name: 'Merged T20 Checkout' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Show done Epics (1)' }),
    ).toBeInTheDocument();
    const done = screen.getByRole('region', { name: 'Done' });
    expect(within(done).getAllByRole('link', { name: /Child/ })).toHaveLength(
      2,
    );
    finish({ ok: true, projectId: 1 });
  });

  it('shows a refusal and restores the Epic', async () => {
    vi.mocked(completeTicket).mockResolvedValue({
      ok: false,
      error: 'Could not complete T20',
    });
    renderBoard();

    await userEvent.click(merged());

    expect(await screen.findByText('Could not complete T20')).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'Merged T20 Checkout' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: /Show done Epics/ }),
    ).not.toBeInTheDocument();
  });
});
