import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attachTicketToEpic,
  createTicket,
  detachTicketFromEpic,
} from '../../app/tickets/actions';
import { renderWithTheme } from '../../test/render';
import type { EpicChild } from '../../tickets/tickets';
import { EpicChildren } from './epic-children';

vi.mock('../../app/tickets/actions', () => ({
  attachTicketToEpic: vi.fn(),
  createTicket: vi.fn(),
  detachTicketFromEpic: vi.fn(),
}));

const card: EpicChild = {
  number: 5,
  title: 'Pay by card',
  status: 'In progress',
  archived: false,
  blockedBy: [],
  blocked: false,
};

const invoice: EpicChild = {
  number: 6,
  title: 'Send the invoice',
  status: 'Todo',
  archived: false,
  blockedBy: [5],
  blocked: true,
};

const epic = { number: 4, projectId: 1, archived: false };

const childList = () => screen.getByRole('list', { name: 'Child Tickets' });

describe('EpicChildren', () => {
  beforeEach(() => {
    vi.mocked(attachTicketToEpic).mockReset();
    vi.mocked(createTicket).mockReset();
    vi.mocked(detachTicketFromEpic).mockReset();
  });

  it('links each child with its Status, and says when it is blocked', () => {
    renderWithTheme(<EpicChildren epic={epic} items={[card, invoice]} />);

    const items = within(childList()).getAllByRole('listitem');
    expect(
      within(items[0]).getByRole('link', { name: '#5 Pay by card' }),
    ).toHaveAttribute('href', '/project/1/ticket/5');
    expect(items[0]).toHaveTextContent('In progress');
    expect(items[1]).toHaveTextContent('Todo · Blocked');
  });

  it('says when the Epic has no children', () => {
    renderWithTheme(<EpicChildren epic={epic} items={[]} />);

    expect(screen.getByText('No child Tickets')).toBeInTheDocument();
  });

  it('creates a child Ticket under the Epic', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 7 });
    renderWithTheme(<EpicChildren epic={epic} items={[]} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'New child Ticket title' }),
      'Refund{Enter}',
    );

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: 1,
      title: 'Refund',
      epicNumber: 4,
    });
  });

  it('attaches an existing Ticket by number', async () => {
    vi.mocked(attachTicketToEpic).mockResolvedValue({ ok: true });
    renderWithTheme(<EpicChildren epic={epic} items={[]} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Attach Ticket' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Ticket number to attach' }),
      '#9{Enter}',
    );

    expect(attachTicketToEpic).toHaveBeenCalledExactlyOnceWith({
      epic: 4,
      child: 9,
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: 'Ticket number to attach' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('shows why an attach was refused', async () => {
    vi.mocked(attachTicketToEpic).mockResolvedValue({
      ok: false,
      error: 'Ticket #9 is already in Epic #2. Detach it from that Epic first.',
    });
    renderWithTheme(<EpicChildren epic={epic} items={[]} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Attach Ticket' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Ticket number to attach' }),
      '9{Enter}',
    );

    expect(
      await screen.findByText(
        'Ticket #9 is already in Epic #2. Detach it from that Epic first.',
      ),
    ).toBeInTheDocument();
  });

  it('detaches a child at once', async () => {
    const { promise, resolve } =
      Promise.withResolvers<Awaited<ReturnType<typeof detachTicketFromEpic>>>();
    vi.mocked(detachTicketFromEpic).mockReturnValue(promise);
    renderWithTheme(<EpicChildren epic={epic} items={[card, invoice]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Detach #5' }));

    expect(detachTicketFromEpic).toHaveBeenCalledExactlyOnceWith({ number: 5 });
    expect(
      within(childList())
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['#6 Send the invoice']);
    await act(async () => resolve({ ok: true }));
  });
});
