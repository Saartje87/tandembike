import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentConversationActivity } from '../../app/conversations/actions';
import { activity, liveConversation } from '../../test/conversation-activity';
import { mockRouter } from '../../test/navigation';
import { renderWithTheme } from '../../test/render';
import { ConversationActivityProvider } from '../conversation-activity/conversation-activity';
import { LiveUpdates } from '../live-updates/live-updates';
import { TicketCard } from './ticket-card';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));
vi.mock('../../app/conversations/actions', () => ({
  currentConversationActivity: vi.fn(),
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() {
    FakeEventSource.instances.push(this);
  }
}

const ticket = {
  number: 4,
  title: 'Fix the header',
  description: '',
  status: 'In progress' as const,
  projectId: 1,
  position: 0,
  archived: false,
  labels: [],
  externalReferences: [],
  attachments: [],
  blockedBy: [],
  blocked: false,
  type: 'Ticket' as const,
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

describe('TicketCard', () => {
  it('shows its number beside the title link', () => {
    renderWithTheme(
      <TicketCard ticket={ticket} boardPath="/project/1/cycle/7" />,
    );

    const title = screen.getByRole('link', { name: 'Fix the header' });
    expect(title).toHaveAttribute('href', '/project/1/cycle/7?ticket=4');
    expect(screen.getByText('T4').parentElement).toContainElement(title);
  });

  it('has no drag handle: the whole card is dragged (T242)', () => {
    renderWithTheme(
      <TicketCard ticket={ticket} boardPath="/project/1/cycle/7" />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('listitem')).toContainElement(
      screen.getByRole('link', { name: 'Fix the header' }),
    );
  });

  it('does not show a Status dropdown on the card', () => {
    renderWithTheme(
      <TicketCard ticket={ticket} boardPath="/project/1/cycle/7" />,
    );

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows its labels', () => {
    renderWithTheme(
      <TicketCard
        ticket={{ ...ticket, labels: ['bug', 'needs-triage'] }}
        boardPath="/project/1/cycle/7"
      />,
    );

    expect(
      within(screen.getByRole('list', { name: 'Labels' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['bug', 'needs-triage']);
  });

  it('shows no label list without labels', () => {
    renderWithTheme(
      <TicketCard ticket={ticket} boardPath="/project/1/cycle/7" />,
    );

    expect(
      screen.queryByRole('list', { name: 'Labels' }),
    ).not.toBeInTheDocument();
  });

  describe('blocked', () => {
    const blocked = { name: 'Blocked by an unresolved Ticket' };

    it('says so beside its labels when the Ticket is blocked', () => {
      renderWithTheme(
        <TicketCard
          boardPath="/project/1/cycle/7"
          ticket={{ ...ticket, labels: ['bug'], blockedBy: [3], blocked: true }}
        />,
      );

      const marker = screen.getByRole('img', blocked);
      expect(marker).toHaveTextContent('Blocked');
      expect(marker.parentElement).toContainElement(
        screen.getByRole('list', { name: 'Labels' }),
      );
    });

    it('says so for a blocked Ticket that is still Todo', () => {
      renderWithTheme(
        <TicketCard
          boardPath="/project/1/cycle/7"
          ticket={{ ...ticket, status: 'Todo', blockedBy: [3], blocked: true }}
        />,
      );

      expect(screen.getByRole('img', blocked)).toBeInTheDocument();
    });

    it('says nothing, not even ready, when it is not blocked', () => {
      renderWithTheme(
        <TicketCard
          ticket={{ ...ticket, blockedBy: [3], blocked: false }}
          boardPath="/project/1/cycle/7"
        />,
      );

      expect(screen.queryByRole('img', blocked)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/^(Blocked|Ready to start)$/),
      ).not.toBeInTheDocument();
    });

    it('says nothing once the Ticket is Done, though a Blocker is unresolved', () => {
      renderWithTheme(
        <TicketCard
          boardPath="/project/1/cycle/7"
          ticket={{ ...ticket, status: 'Done', blockedBy: [3], blocked: true }}
        />,
      );

      expect(screen.queryByRole('img', blocked)).not.toBeInTheDocument();
    });
  });

  describe('acceptance-criteria progress', () => {
    const criteria = (...checked: boolean[]) =>
      checked.map((isChecked, index) => ({
        id: index + 1,
        text: `Criterion ${index + 1}`,
        checked: isChecked,
      }));

    it('shows how many criteria are checked out of the total', () => {
      renderWithTheme(
        <TicketCard
          boardPath="/project/1/cycle/7"
          ticket={{
            ...ticket,
            acceptanceCriteria: criteria(true, false, true, false),
          }}
        />,
      );

      const progress = screen.getByRole('img', {
        name: 'Acceptance criteria: 2 of 4 checked',
      });
      expect(progress).toHaveTextContent('2/4');
    });

    it('shows no count for a Ticket without criteria', () => {
      renderWithTheme(
        <TicketCard ticket={ticket} boardPath="/project/1/cycle/7" />,
      );

      expect(
        screen.queryByRole('img', { name: /Acceptance criteria/ }),
      ).not.toBeInTheDocument();
    });

    it('updates the count when the Board data changes', () => {
      const { rerender } = renderWithTheme(
        <TicketCard
          boardPath="/project/1/cycle/7"
          ticket={{ ...ticket, acceptanceCriteria: criteria(false, false) }}
        />,
      );

      rerender(
        <TicketCard
          boardPath="/project/1/cycle/7"
          ticket={{ ...ticket, acceptanceCriteria: criteria(true, false) }}
        />,
      );

      expect(
        screen.getByRole('img', {
          name: 'Acceptance criteria: 1 of 2 checked',
        }),
      ).toHaveTextContent('1/2');
    });
  });

  describe('Epics', () => {
    it('links a child to its Epic', () => {
      renderWithTheme(
        <TicketCard
          boardPath="/project/1/cycle/7"
          ticket={{
            ...ticket,
            epic: { number: 2, title: 'Checkout', color: 'teal' },
          }}
        />,
      );

      expect(
        screen.getByRole('link', { name: 'Epic T2 Checkout' }),
      ).toHaveAttribute('href', '/ticket/2');
    });

    it("shows the Epic link as a badge in the Epic's colour", () => {
      renderWithTheme(
        <TicketCard
          boardPath="/project/1/cycle/7"
          ticket={{
            ...ticket,
            epic: { number: 2, title: 'Checkout', color: 'amber' },
          }}
        />,
      );

      expect(
        screen.getByRole('link', { name: 'Epic T2 Checkout' }),
      ).toHaveAttribute('data-color', 'amber');
    });

    it('shows no Epic link for a Ticket outside any Epic', () => {
      renderWithTheme(
        <TicketCard ticket={ticket} boardPath="/project/1/cycle/7" />,
      );

      expect(
        screen.queryByRole('link', { name: /^Epic/ }),
      ).not.toBeInTheDocument();
    });
  });
});

describe('Selecting a TicketCard', () => {
  const selectable = (selected = false) => {
    const onSelect = vi.fn();
    renderWithTheme(
      <TicketCard
        ticket={ticket}
        boardPath="/project/1"
        selected={selected}
        onSelect={onSelect}
      />,
    );
    return onSelect;
  };

  it('offers no checkbox on a card that cannot be selected', () => {
    renderWithTheme(<TicketCard ticket={ticket} boardPath="/project/1" />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('has a checkbox named after the Ticket, checked when selected', () => {
    selectable(true);

    expect(
      screen.getByRole('checkbox', { name: 'Select T4 Fix the header' }),
    ).toBeChecked();
  });

  it('toggles with a Cmd-click or Ctrl-click on the card and asks for a range with a Shift-click', async () => {
    const user = userEvent.setup();
    const onSelect = selectable();
    const title = screen.getByRole('link', { name: 'Fix the header' });

    for (const key of ['Meta', 'Control', 'Shift']) {
      await user.keyboard(`{${key}>}`);
      await user.click(title);
      await user.keyboard(`{/${key}}`);
    }

    expect(onSelect.mock.calls).toEqual([['toggle'], ['toggle'], ['range']]);
  });

  it('toggles with its checkbox, or asks for a range with a Shift-click on it', async () => {
    const user = userEvent.setup();
    const onSelect = selectable();
    const checkbox = screen.getByRole('checkbox');

    await user.click(checkbox);
    await user.keyboard('{Shift>}');
    await user.click(checkbox);
    await user.keyboard('{/Shift}');

    expect(onSelect.mock.calls).toEqual([['toggle'], ['range']]);
  });

  describe('PR link', () => {
    const pullRequest = 'https://github.com/owner/repo/pull/87';
    const withReferences = (externalReferences: string[]) =>
      renderWithTheme(
        <TicketCard
          ticket={{ ...ticket, externalReferences }}
          boardPath="/project/1"
        />,
      );

    it('links an In progress Ticket to its PR', () => {
      withReferences(['ABC-33', pullRequest]);

      expect(
        screen.getByRole('link', { name: 'owner/repo#87' }),
      ).toHaveAttribute('href', pullRequest);
    });

    it('shows no link for a non-PR External reference', () => {
      withReferences(['https://github.com/owner/repo/issues/87', 'ABC-33']);

      expect(screen.queryByText('owner/repo#87')).not.toBeInTheDocument();
    });
  });

  describe('Conversation activity', () => {
    const showWith = (running: { running: number[]; needsYou: number[] }) => {
      vi.mocked(currentConversationActivity).mockResolvedValue(
        activity({ ...running, needsYouCount: running.needsYou.length }),
      );
      renderWithTheme(
        <ConversationActivityProvider>
          <TicketCard ticket={ticket} boardPath="/project/1" />
        </ConversationActivityProvider>,
      );
    };

    it('shows a running indicator while one of its Conversations runs', async () => {
      showWith({ running: [4], needsYou: [] });

      expect(await screen.findByText('Agent running')).toBeInTheDocument();
      expect(screen.queryByText('Needs you')).not.toBeInTheDocument();
    });

    it('shows a needs-you mark while one of its Conversations waits for the User', async () => {
      showWith({ running: [], needsYou: [4] });

      expect(await screen.findByText('Needs you')).toBeInTheDocument();
      expect(screen.queryByText('Agent running')).not.toBeInTheDocument();
    });

    it('shows neither for another Ticket', async () => {
      showWith({ running: [5], needsYou: [6] });

      await waitFor(() =>
        expect(currentConversationActivity).toHaveBeenCalled(),
      );
      expect(screen.queryByText('Agent running')).not.toBeInTheDocument();
      expect(screen.queryByText('Needs you')).not.toBeInTheDocument();
    });
  });

  describe('Status line', () => {
    const activityWith = (line: string) =>
      activity({
        live: { 4: liveConversation({ line, cost: 0.42 }) },
        cost: { 4: 1.6 },
        running: [4],
      });
    const renderCard = (status: 'In progress' | 'Todo' = 'In progress') =>
      renderWithTheme(
        <ConversationActivityProvider>
          <TicketCard ticket={{ ...ticket, status }} boardPath="/project/1" />
        </ConversationActivityProvider>,
      );

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date('2026-11-07T10:03:30Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows what the live Conversation is doing, with how long it has run', async () => {
      vi.mocked(currentConversationActivity).mockResolvedValue(
        activityWith('Reading board.tsx'),
      );
      renderCard();

      expect(await screen.findByText('Reading board.tsx')).toBeInTheDocument();
      expect(screen.getByText('3m · $0.42')).toBeInTheDocument();
    });

    it('follows the Conversation as its latest entry changes', async () => {
      vi.stubGlobal('EventSource', FakeEventSource);
      vi.mocked(useRouter).mockReturnValue(mockRouter());
      vi.mocked(currentConversationActivity).mockResolvedValueOnce(
        activityWith('Reading board.tsx'),
      );
      renderWithTheme(
        <LiveUpdates>
          <ConversationActivityProvider>
            <TicketCard ticket={ticket} boardPath="/project/1" />
          </ConversationActivityProvider>
        </LiveUpdates>,
      );
      expect(await screen.findByText('Reading board.tsx')).toBeInTheDocument();

      vi.mocked(currentConversationActivity).mockResolvedValueOnce(
        activityWith('Running npm run check'),
      );
      act(() => {
        FakeEventSource.instances[0]?.onmessage?.(
          new MessageEvent('message', {
            data: JSON.stringify({ type: 'conversation', id: 1 }),
          }),
        );
      });

      expect(
        await screen.findByText('Running npm run check'),
      ).toBeInTheDocument();
      expect(screen.queryByText('Reading board.tsx')).not.toBeInTheDocument();
      vi.unstubAllGlobals();
    });

    it('shows the running cost on the status line', async () => {
      vi.mocked(currentConversationActivity).mockResolvedValue(
        activityWith('Reading board.tsx'),
      );
      renderCard();

      expect(await screen.findByText('3m · $0.42')).toBeInTheDocument();
    });

    it('shows no line without a live Conversation', async () => {
      vi.mocked(currentConversationActivity).mockResolvedValue({
        ...activityWith('x'),
        live: {},
      });
      renderCard();

      await waitFor(() =>
        expect(currentConversationActivity).toHaveBeenCalled(),
      );
      expect(screen.queryByText('3m')).not.toBeInTheDocument();
    });

    it('shows no line on a card outside In progress', async () => {
      vi.mocked(currentConversationActivity).mockResolvedValue(
        activityWith('Reading board.tsx'),
      );
      renderCard('Todo');

      await waitFor(() =>
        expect(currentConversationActivity).toHaveBeenCalled(),
      );
      expect(screen.queryByText('Reading board.tsx')).not.toBeInTheDocument();
    });
  });

  describe('Cost', () => {
    const renderWithCost = async (
      cost: Record<number, number>,
      status: 'In progress' | 'Done' = 'Done',
    ) => {
      vi.mocked(currentConversationActivity).mockResolvedValue(
        activity({ cost }),
      );
      renderWithTheme(
        <ConversationActivityProvider>
          <TicketCard ticket={{ ...ticket, status }} boardPath="/project/1" />
        </ConversationActivityProvider>,
      );
      await waitFor(() =>
        expect(currentConversationActivity).toHaveBeenCalled(),
      );
    };

    it("shows the total over the Ticket's Conversations, also on a Done Ticket", async () => {
      await renderWithCost({ 4: 1.6 });

      expect(await screen.findByText('$1.60')).toBeInTheDocument();
    });

    it('shows nothing when the Ticket has cost nothing', async () => {
      await renderWithCost({ 9: 3 });

      expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    });
  });

  describe('Merged button', () => {
    it('is shown only for a card given onMerged, and calls it', async () => {
      const onMerged = vi.fn();
      const { unmount } = renderWithTheme(
        <TicketCard ticket={ticket} boardPath="/project/1/cycle/7" />,
      );
      expect(screen.queryByRole('button', { name: /^Merged/ })).toBeNull();
      unmount();

      renderWithTheme(
        <TicketCard
          ticket={ticket}
          boardPath="/project/1/cycle/7"
          onMerged={onMerged}
        />,
      );
      await userEvent.click(screen.getByRole('button', { name: /^Merged/ }));

      expect(onMerged).toHaveBeenCalledOnce();
    });
  });
});
