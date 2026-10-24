import { fireEvent, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTicket } from '../../app/tickets/actions';
import { renderWithTheme } from '../../test/render';
import { NewTicketInline } from './new-ticket-inline';

vi.mock('../../app/tickets/actions', () => ({ createTicket: vi.fn() }));

const titleField = () =>
  screen.getByRole<HTMLInputElement>('textbox', { name: 'New Ticket title' });

describe('NewTicketInline', () => {
  beforeEach(() => {
    vi.mocked(createTicket).mockReset();
  });

  it('plans a new Ticket into the Cycle whose tab it is on', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderWithTheme(<NewTicketInline projectId={3} cycleId={7} />);

    await userEvent.type(titleField(), 'Fix the header{Enter}');

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      title: 'Fix the header',
      cycleId: 7,
    });
  });

  it('creates an Epic with the title from its own button', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), 'Checkout');
    await userEvent.click(screen.getByRole('button', { name: 'Create Epic' }));

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      title: 'Checkout',
      type: 'Epic',
    });
  });

  it('creates a child Ticket under an Epic, with no Epic button', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderWithTheme(<NewTicketInline projectId={3} epicNumber={8} />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'New child Ticket title' }),
      'Pay by card{Enter}',
    );

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      title: 'Pay by card',
      epicNumber: 8,
    });
    expect(
      screen.queryByRole('button', { name: 'Create Epic' }),
    ).not.toBeInTheDocument();
  });

  it('creates a Ticket with the title on Enter', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), 'Fix the header{Enter}');

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      title: 'Fix the header',
    });
  });

  it('is empty and focused for another Ticket after creating one', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), 'Fix the header{Enter}');

    await waitFor(() => expect(titleField()).toHaveValue(''));
    expect(titleField()).toHaveFocus();
  });

  it('explains a refused title next to the field and keeps the text', async () => {
    vi.mocked(createTicket).mockResolvedValue({
      ok: false,
      error: 'Enter a title.',
      fieldErrors: { title: 'Enter a title.' },
    });
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), '   {Enter}');

    await waitFor(() =>
      expect(titleField()).toHaveAccessibleDescription('Enter a title.'),
    );
    expect(titleField()).toBeInvalid();
    expect(titleField()).toHaveValue('   ');
  });

  it('shows an error that is not about the title next to the field', async () => {
    vi.mocked(createTicket).mockResolvedValue({
      ok: false,
      error: 'There is no Project with id 3.',
    });
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), 'Fix the header{Enter}');

    await waitFor(() =>
      expect(titleField()).toHaveAccessibleDescription(
        'There is no Project with id 3.',
      ),
    );
    expect(titleField()).not.toBeInvalid();
    expect(titleField()).toHaveValue('Fix the header');
  });

  it('cancels on Escape without creating a Ticket', async () => {
    vi.mocked(createTicket).mockResolvedValue({
      ok: false,
      error: 'Enter a title.',
      fieldErrors: { title: 'Enter a title.' },
    });
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), ' {Enter}');
    await waitFor(() => expect(titleField()).toBeInvalid());
    await userEvent.type(titleField(), 'Fix the header{Escape}');

    expect(createTicket).toHaveBeenCalledOnce();
    expect(titleField()).toHaveValue('');
    expect(titleField()).not.toBeInvalid();
    expect(titleField()).not.toHaveAccessibleDescription();
    expect(titleField()).not.toHaveFocus();
  });

  it('creates one Ticket however often Enter is pressed while it saves', async () => {
    let finish: (result: { ok: true; number: number }) => void = () => {};
    vi.mocked(createTicket).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), 'Fix the header{Enter}');
    // Browsers submit on Enter in a read-only field; user-event does not.
    const { form } = titleField();
    if (!form) {
      throw new Error('The title field is not in a form.');
    }
    fireEvent.submit(form);
    await userEvent.keyboard('{Enter}next{Escape}');
    finish({ ok: true, number: 12 });

    await waitFor(() => expect(titleField()).toHaveValue(''));
    expect(createTicket).toHaveBeenCalledOnce();
    expect(titleField()).toHaveFocus();
  });

  it('shows a placeholder in the empty field', () => {
    renderWithTheme(<NewTicketInline projectId={3} />);

    expect(titleField()).toHaveAttribute('placeholder', 'Add a Ticket…');
  });

  it('creates a Ticket with the Create Ticket button', async () => {
    vi.mocked(createTicket).mockResolvedValue({ ok: true, number: 12 });
    renderWithTheme(<NewTicketInline projectId={3} />);

    await userEvent.type(titleField(), 'Fix the header');
    await userEvent.click(
      screen.getByRole('button', { name: 'Create Ticket' }),
    );

    expect(createTicket).toHaveBeenCalledExactlyOnceWith({
      projectId: 3,
      title: 'Fix the header',
    });
    await waitFor(() => expect(titleField()).toHaveValue(''));
  });
});
