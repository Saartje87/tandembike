import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { TicketCard } from './ticket-card';

const ticket = {
  number: 4,
  title: 'Fix the header',
  description: '',
  status: 'In progress' as const,
  projectId: 1,
  position: 0,
  archived: false,
  labels: [],
  blockedBy: [],
  blocked: false,
  type: 'Ticket' as const,
  epic: null,
  children: [],
  claim: null,
  acceptanceCriteria: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('TicketCard', () => {
  it('shows its number beside the title link', () => {
    renderWithTheme(<TicketCard ticket={ticket} />);

    const title = screen.getByRole('link', { name: 'Fix the header' });
    expect(title).toHaveAttribute('href', '/project/1/ticket/4');
    expect(screen.getByText('#4').parentElement).toContainElement(title);
  });

  it('shows an icon-only drag handle with an accessible name', () => {
    renderWithTheme(<TicketCard ticket={ticket} />);

    const handle = screen.getByRole('button', {
      name: 'Drag Ticket #4 to another Status',
    });
    expect(handle).not.toHaveTextContent('Drag');
    const icon = handle.querySelector('span[role="presentation"]');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute(
      'style',
      expect.stringContaining('/heroicons/outline/bars-3.svg'),
    );
    expect(
      (handle.compareDocumentPosition(
        screen.getByRole('link', { name: 'Fix the header' }),
      ) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
    ).toBe(true);
  });

  it('does not show a Status dropdown on the card', () => {
    renderWithTheme(<TicketCard ticket={ticket} />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows its labels', () => {
    renderWithTheme(
      <TicketCard ticket={{ ...ticket, labels: ['bug', 'needs-triage'] }} />,
    );

    expect(
      within(screen.getByRole('list', { name: 'Labels' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['bug', 'needs-triage']);
  });

  it('shows no label list without labels', () => {
    renderWithTheme(<TicketCard ticket={ticket} />);

    expect(
      screen.queryByRole('list', { name: 'Labels' }),
    ).not.toBeInTheDocument();
  });

  describe('blocked', () => {
    const blocked = { name: 'Blocked by an unresolved Ticket' };

    it('says so beside its labels when the Ticket is blocked', () => {
      renderWithTheme(
        <TicketCard
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
          ticket={{ ...ticket, status: 'Todo', blockedBy: [3], blocked: true }}
        />,
      );

      expect(screen.getByRole('img', blocked)).toBeInTheDocument();
    });

    it('says nothing, not even ready, when it is not blocked', () => {
      renderWithTheme(
        <TicketCard ticket={{ ...ticket, blockedBy: [3], blocked: false }} />,
      );

      expect(screen.queryByRole('img', blocked)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/^(Blocked|Ready to start)$/),
      ).not.toBeInTheDocument();
    });

    it('says nothing once the Ticket is Done, though a Blocker is unresolved', () => {
      renderWithTheme(
        <TicketCard
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
      renderWithTheme(<TicketCard ticket={ticket} />);

      expect(
        screen.queryByRole('img', { name: /Acceptance criteria/ }),
      ).not.toBeInTheDocument();
    });

    it('updates the count when the Board data changes', () => {
      const { rerender } = renderWithTheme(
        <TicketCard
          ticket={{ ...ticket, acceptanceCriteria: criteria(false, false) }}
        />,
      );

      rerender(
        <TicketCard
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
    const child = (
      number: number,
      status: 'Todo' | 'In progress' | 'Done',
      archived = false,
    ) => ({
      number,
      title: `Child ${number}`,
      status,
      archived,
      blockedBy: [],
      blocked: false,
    });

    it('marks an Epic and counts its children that are Done', () => {
      renderWithTheme(
        <TicketCard
          ticket={{
            ...ticket,
            type: 'Epic',
            children: [
              child(5, 'Done'),
              child(6, 'In progress'),
              child(7, 'Todo'),
              child(8, 'Done', true),
            ],
          }}
        />,
      );

      expect(
        screen.getByRole('img', { name: 'Epic: 1 of 3 child Tickets Done' }),
      ).toHaveTextContent('Epic1/3');
    });

    it('links a child to its Epic', () => {
      renderWithTheme(
        <TicketCard
          ticket={{ ...ticket, epic: { number: 2, title: 'Checkout' } }}
        />,
      );

      expect(
        screen.getByRole('link', { name: 'Epic #2 Checkout' }),
      ).toHaveAttribute('href', '/project/1/ticket/2');
    });

    it('shows neither for a Ticket outside any Epic', () => {
      renderWithTheme(<TicketCard ticket={ticket} />);

      expect(
        screen.queryByRole('img', { name: /^Epic/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('link', { name: /^Epic/ }),
      ).not.toBeInTheDocument();
    });
  });
});
