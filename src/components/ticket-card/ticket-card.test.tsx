import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { currentConversationActivity } from '../../app/conversations/actions';
import { renderWithTheme } from '../../test/render';
import { ConversationActivityProvider } from '../conversation-activity/conversation-activity';
import { TicketCard } from './ticket-card';

vi.mock('../../app/conversations/actions', () => ({
  currentConversationActivity: vi.fn(),
}));

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

  describe('Conversation activity', () => {
    const showWith = (activity: { running: number[]; needsYou: number[] }) => {
      vi.mocked(currentConversationActivity).mockResolvedValue({
        ...activity,
        needsYouCount: activity.needsYou.length,
        needsYouByProject: {},
      });
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
});
