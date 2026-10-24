import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { detachTicketFromEpic } from '../../app/tickets/actions';
import { renderWithTheme } from '../../test/render';
import { TicketEpic } from './ticket-epic';

vi.mock('../../app/tickets/actions', () => ({
  detachTicketFromEpic: vi.fn(),
}));

const child = {
  number: 5,
  projectId: 1,
  epic: { number: 4, title: 'Checkout' },
};

describe('TicketEpic', () => {
  beforeEach(() => {
    vi.mocked(detachTicketFromEpic).mockReset();
  });

  it('links a child to its Epic', () => {
    renderWithTheme(<TicketEpic ticket={child} />);

    expect(screen.getByRole('link', { name: '#4 Checkout' })).toHaveAttribute(
      'href',
      '/project/1/ticket/4',
    );
  });

  it('says when the Ticket is in no Epic', () => {
    renderWithTheme(<TicketEpic ticket={{ ...child, epic: null }} />);

    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('detaches the Ticket from its Epic, and shows a refusal', async () => {
    vi.mocked(detachTicketFromEpic).mockResolvedValue({
      ok: false,
      error: 'There is no Ticket #5.',
    });
    renderWithTheme(<TicketEpic ticket={child} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Detach from Epic' }),
    );

    expect(detachTicketFromEpic).toHaveBeenCalledExactlyOnceWith({ number: 5 });
    expect(
      await screen.findByText('There is no Ticket #5.'),
    ).toBeInTheDocument();
  });
});
