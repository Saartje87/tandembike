import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setTicketOrigin } from '../../app/tickets/actions';
import { renderWithTheme } from '../../test/render';
import { TicketOrigin } from './ticket-origin';

vi.mock('../../app/tickets/actions', () => ({
  setTicketOrigin: vi.fn(),
}));

const split = {
  number: 5,
  origin: { number: 4, title: 'Checkout spec', status: 'Done' as const },
};

describe('TicketOrigin', () => {
  beforeEach(() => {
    vi.mocked(setTicketOrigin).mockReset();
  });

  it('links the Ticket to its Origin, with its Status', () => {
    renderWithTheme(<TicketOrigin ticket={split} />);

    expect(
      screen.getByRole('link', { name: 'T4 Checkout spec' }),
    ).toHaveAttribute('href', '/ticket/4');
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('says when the Ticket has no Origin', () => {
    renderWithTheme(<TicketOrigin ticket={{ ...split, origin: null }} />);

    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('sets an Origin by its number', async () => {
    vi.mocked(setTicketOrigin).mockResolvedValue({ ok: true });
    renderWithTheme(<TicketOrigin ticket={{ ...split, origin: null }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Set Origin' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Origin Ticket number' }),
      '#4{Enter}',
    );

    expect(setTicketOrigin).toHaveBeenCalledExactlyOnceWith({
      number: 5,
      originNumber: 4,
    });
    expect(
      screen.queryByRole('textbox', { name: 'Origin Ticket number' }),
    ).not.toBeInTheDocument();
  });

  it('changes the Origin, and keeps the field open with the reason when refused', async () => {
    vi.mocked(setTicketOrigin).mockResolvedValue({
      ok: false,
      error: 'T6 cannot be the Origin of T5.',
    });
    renderWithTheme(<TicketOrigin ticket={split} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Change Origin' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Origin Ticket number' }),
      '6{Enter}',
    );

    expect(setTicketOrigin).toHaveBeenCalledExactlyOnceWith({
      number: 5,
      originNumber: 6,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'T6 cannot be the Origin of T5.',
    );
    expect(
      screen.getByRole('textbox', { name: 'Origin Ticket number' }),
    ).toHaveValue('6');
  });

  it('asks for a Ticket number before saving', async () => {
    renderWithTheme(<TicketOrigin ticket={{ ...split, origin: null }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Set Origin' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Origin Ticket number' }),
      'spec{Enter}',
    );

    expect(setTicketOrigin).not.toHaveBeenCalled();
    expect(
      screen.getByText('Enter a Ticket number, like T42.'),
    ).toBeInTheDocument();
  });

  it('cancels with Escape, leaving the Origin as it was', async () => {
    renderWithTheme(<TicketOrigin ticket={split} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Change Origin' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Origin Ticket number' }),
      '6{Escape}',
    );

    expect(setTicketOrigin).not.toHaveBeenCalled();
    expect(
      screen.getByRole('link', { name: 'T4 Checkout spec' }),
    ).toBeInTheDocument();
  });

  it('clears the Origin at once, and shows a refusal', async () => {
    vi.mocked(setTicketOrigin).mockResolvedValue({
      ok: false,
      error: 'There is no Ticket T5.',
    });
    renderWithTheme(<TicketOrigin ticket={split} />);

    await userEvent.click(screen.getByRole('button', { name: 'Clear Origin' }));

    expect(setTicketOrigin).toHaveBeenCalledExactlyOnceWith({
      number: 5,
      originNumber: null,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no Ticket T5.',
    );
  });
});
