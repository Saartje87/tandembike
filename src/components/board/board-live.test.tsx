import { act, screen, within } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentConversationActivity } from '../../app/conversations/actions';
import {
  type ConversationActivity,
  noConversationActivity,
} from '../../conversations/conversation-activity';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import type { Ticket } from '../../tickets/tickets';
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
  createTicket: vi.fn(),
  moveTickets: vi.fn(),
  moveTicketsToEpic: vi.fn(),
  reorderTickets: vi.fn(),
  updateTicket: vi.fn(),
}));

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

const project = {
  id: 1,
  name: 'Website',
  color: null,
  icon: null,
  archived: false,
  createdAt: new Date('2026-01-01'),
};

const inProgress: Ticket = {
  number: 7,
  title: 'Fix the header',
  description: '',
  status: 'In progress',
  projectId: project.id,
  position: 0,
  archived: false,
  labels: [],
  // An open PR: Review, unless a live Conversation says otherwise.
  externalReferences: ['https://github.com/owner/repo/pull/87'],
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
};

const activity = (state: 'running' | 'waiting'): ConversationActivity => ({
  ...noConversationActivity,
  live: {
    7: {
      state,
      line: 'Reading board.tsx',
      since: '2026-11-07T10:00:00.000Z',
      cost: 0,
    },
  },
});

const cardsIn = (section: string) =>
  within(screen.getByRole('group', { name: section }))
    .queryAllByRole('link', { name: 'Fix the header' })
    .map((link) => link.getAttribute('aria-label'));

describe('Board with live Conversations', () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.mocked(useRouter).mockReturnValue(mockRouter());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(currentConversationActivity).mockReset();
  });

  it('moves a card between sections as its Conversation changes', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValueOnce(
      activity('running'),
    );
    renderWithTheme(
      <LiveUpdates>
        <ConversationActivityProvider>
          <Board project={project} tickets={[inProgress]} />
        </ConversationActivityProvider>
      </LiveUpdates>,
    );

    await vi.waitFor(() =>
      expect(cardsIn('Running')).toEqual(['Fix the header']),
    );
    expect(cardsIn('Review')).toEqual([]);

    vi.mocked(currentConversationActivity).mockResolvedValueOnce(
      activity('waiting'),
    );
    act(() => {
      FakeEventSource.instances[0]?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'conversation', id: 1 }),
        }),
      );
    });

    await vi.waitFor(() =>
      expect(cardsIn('Action needed')).toEqual(['Fix the header']),
    );
    expect(cardsIn('Running')).toEqual([]);

    vi.mocked(currentConversationActivity).mockResolvedValueOnce(
      noConversationActivity,
    );
    act(() => {
      FakeEventSource.instances[0]?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'conversation', id: 1 }),
        }),
      );
    });

    await vi.waitFor(() =>
      expect(cardsIn('Review')).toEqual(['Fix the header']),
    );
  });

  it('shows the status line on an In progress card with a live Conversation', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValueOnce(
      activity('running'),
    );
    renderWithTheme(
      <LiveUpdates>
        <ConversationActivityProvider>
          <Board
            project={project}
            tickets={[inProgress, { ...inProgress, number: 8, title: 'Idle' }]}
          />
        </ConversationActivityProvider>
      </LiveUpdates>,
    );

    const line = await screen.findByText('Reading board.tsx');
    expect(
      within(screen.getByRole('group', { name: 'Running' })).getByText(
        'Reading board.tsx',
      ),
    ).toBe(line);
    expect(screen.getAllByText('Reading board.tsx')).toHaveLength(1);
  });

  it('offers Merged on a Review card only while no Conversation is live', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValueOnce(
      activity('running'),
    );
    renderWithTheme(
      <LiveUpdates>
        <ConversationActivityProvider>
          <Board project={project} tickets={[inProgress]} />
        </ConversationActivityProvider>
      </LiveUpdates>,
    );

    await vi.waitFor(() =>
      expect(cardsIn('Running')).toEqual(['Fix the header']),
    );
    expect(
      screen.queryByRole('button', { name: /^Merged T7/ }),
    ).not.toBeInTheDocument();

    vi.mocked(currentConversationActivity).mockResolvedValueOnce(
      noConversationActivity,
    );
    act(() => {
      FakeEventSource.instances[0]?.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({ type: 'conversation', id: 1 }),
        }),
      );
    });

    expect(
      await screen.findByRole('button', { name: /^Merged T7/ }),
    ).toBeInTheDocument();
  });
});
