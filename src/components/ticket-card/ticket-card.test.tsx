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
  origin: null,
  splitOff: [],
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
    expect(screen.getByText('#4').parentElement).toContainElement(title);
  });

  it('shows an icon-only drag handle with an accessible name', () => {
    renderWithTheme(
      <TicketCard ticket={ticket} boardPath="/project/1/cycle/7" />,
    );

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
          ticket={{ ...ticket, epic: { number: 2, title: 'Checkout' } }}
        />,
      );

      expect(
        screen.getByRole('link', { name: 'Epic #2 Checkout' }),
      ).toHaveAttribute('href', '/ticket/2');
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
