import { act, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addTicketBlocker,
  removeTicketBlocker,
} from '../../app/tickets/actions';
import { renderWithTheme } from '../../test/render';
import type { RelatedTicket } from '../../tickets/tickets';
import { BlockerEditor } from './blocker-editor';

vi.mock('../../app/tickets/actions', () => ({
  addTicketBlocker: vi.fn(),
  removeTicketBlocker: vi.fn(),
}));

const design: RelatedTicket = {
  number: 3,
  title: 'Design the header',
  status: 'Done',
  projectId: 1,
  archived: false,
  resolved: true,
};

const api: RelatedTicket = {
  number: 5,
  title: 'Build the API',
  status: 'In progress',
  projectId: 2,
  archived: false,
  resolved: false,
};

/** A promise the test settles itself, to look at the UI while it is pending. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const shown = (name: string) =>
  within(screen.getByRole('list', { name }))
    .queryAllByRole('link')
    .map((link) => link.textContent);

const numberInput = () =>
  screen.getByRole('textbox', { name: 'Ticket number of the Blocker' });

describe('BlockerEditor', () => {
  beforeEach(() => {
    vi.mocked(addTicketBlocker).mockReset();
    vi.mocked(removeTicketBlocker).mockReset();
  });

  it('links each Blocker with its Status', () => {
    renderWithTheme(
      <BlockerEditor
        ticketNumber={4}
        direction="blockedBy"
        related={[design, { ...api, archived: true, resolved: true }]}
      />,
    );

    expect(shown('Blocked by')).toEqual([
      '#3 Design the header',
      '#5 Build the API',
    ]);
    expect(
      screen.getByRole('link', { name: '#3 Design the header' }),
    ).toHaveAttribute('href', '/ticket/3');
    const items = within(
      screen.getByRole('list', { name: 'Blocked by' }),
    ).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Done');
    expect(items[1]).toHaveTextContent('In progress · Archived');
  });

  describe('whether the Ticket is ready to start', () => {
    it('says it is blocked while a Blocker is unresolved', () => {
      renderWithTheme(
        <BlockerEditor
          ticketNumber={4}
          direction="blockedBy"
          related={[design, api]}
        />,
      );

      expect(screen.getByText('Blocked', { exact: true })).toBeInTheDocument();
    });

    it('says it is ready to start once every Blocker is Done or archived', () => {
      renderWithTheme(
        <BlockerEditor
          ticketNumber={4}
          direction="blockedBy"
          related={[design, { ...api, archived: true, resolved: true }]}
        />,
      );

      expect(screen.getByText('Ready to start')).toBeInTheDocument();
      expect(screen.queryByText('Blocked')).not.toBeInTheDocument();
    });

    it('says it is ready as soon as the last unresolved Blocker is removed', async () => {
      const removed = deferred<{ ok: true }>();
      vi.mocked(removeTicketBlocker).mockReturnValue(removed.promise);
      renderWithTheme(
        <BlockerEditor
          ticketNumber={4}
          direction="blockedBy"
          related={[design, api]}
        />,
      );

      await userEvent.click(
        screen.getByRole('button', { name: 'Remove Blocker #5' }),
      );

      expect(screen.getByText('Ready to start')).toBeInTheDocument();
      expect(screen.queryByText('Blocked')).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'Remove Blocker #3' }),
      );

      expect(screen.queryByText(/^(Blocked|Ready to start)$/)).toBeNull();
      await act(async () => removed.resolve({ ok: true }));
    });

    it('says neither without any Blockers', () => {
      renderWithTheme(
        <BlockerEditor ticketNumber={4} direction="blockedBy" related={[]} />,
      );

      expect(screen.queryByText(/^(Blocked|Ready to start)$/)).toBeNull();
    });

    it('says neither for the Tickets it blocks', () => {
      renderWithTheme(
        <BlockerEditor ticketNumber={4} direction="blocks" related={[api]} />,
      );

      expect(screen.queryByText(/^(Blocked|Ready to start)$/)).toBeNull();
    });
  });

  it('adds a Blocker by Ticket number and closes the field once saved', async () => {
    const saved = deferred<{ ok: true }>();
    vi.mocked(addTicketBlocker).mockReturnValue(saved.promise);
    renderWithTheme(
      <BlockerEditor ticketNumber={4} direction="blockedBy" related={[]} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add blocker' }));
    expect(numberInput()).toHaveFocus();
    await userEvent.type(numberInput(), ' #12 {Enter}');

    expect(addTicketBlocker).toHaveBeenCalledExactlyOnceWith({
      blocker: 12,
      blocked: 4,
    });
    expect(numberInput()).toBeDisabled();

    await act(async () => saved.resolve({ ok: true }));

    expect(
      screen.queryByRole('textbox', { name: 'Ticket number of the Blocker' }),
    ).not.toBeInTheDocument();
  });

  it('adds a Ticket this one blocks', async () => {
    vi.mocked(addTicketBlocker).mockResolvedValue({ ok: true });
    renderWithTheme(
      <BlockerEditor ticketNumber={4} direction="blocks" related={[api]} />,
    );

    expect(shown('Blocks')).toEqual(['#5 Build the API']);
    await userEvent.click(
      screen.getByRole('button', { name: 'Add blocked Ticket' }),
    );
    await userEvent.type(
      screen.getByRole('textbox', {
        name: 'Ticket number of the blocked Ticket',
      }),
      '9{Enter}',
    );

    expect(addTicketBlocker).toHaveBeenCalledExactlyOnceWith({
      blocker: 4,
      blocked: 9,
    });
  });

  it('asks for a Ticket number without calling the server', async () => {
    renderWithTheme(
      <BlockerEditor ticketNumber={4} direction="blockedBy" related={[]} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add blocker' }));
    await userEvent.type(numberInput(), 'header{Enter}');

    expect(addTicketBlocker).not.toHaveBeenCalled();
    expect(numberInput()).toHaveAccessibleDescription(
      'Enter a Ticket number, like 42.',
    );
  });

  it("shows the module's reason under the field when a Blocker is refused", async () => {
    vi.mocked(addTicketBlocker).mockResolvedValue({
      ok: false,
      error: '#4 cannot block #3, because #3 already blocks #4: #3 → #4.',
      fieldErrors: {
        blocker: '#4 cannot block #3, because #3 already blocks #4: #3 → #4.',
      },
    });
    renderWithTheme(
      <BlockerEditor ticketNumber={4} direction="blocks" related={[]} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Add blocked Ticket' }),
    );
    const input = screen.getByRole('textbox', {
      name: 'Ticket number of the blocked Ticket',
    });
    await userEvent.type(input, '3{Enter}');

    expect(input).toHaveValue('3');
    expect(input).toHaveAccessibleDescription(
      '#4 cannot block #3, because #3 already blocks #4: #3 → #4.',
    );
  });

  it('shows a missing Ticket as an error', async () => {
    vi.mocked(addTicketBlocker).mockResolvedValue({
      ok: false,
      error: 'There is no Ticket #42.',
    });
    renderWithTheme(
      <BlockerEditor ticketNumber={4} direction="blockedBy" related={[]} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add blocker' }));
    await userEvent.type(numberInput(), '42{Enter}');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'There is no Ticket #42.',
    );
  });

  it('cancels adding with Escape', async () => {
    renderWithTheme(
      <BlockerEditor ticketNumber={4} direction="blockedBy" related={[]} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add blocker' }));
    await userEvent.type(numberInput(), '7{Escape}');

    expect(
      screen.queryByRole('textbox', { name: 'Ticket number of the Blocker' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add blocker' })).toHaveFocus();
  });

  it('removes a Blocker at once, and brings it back when refused', async () => {
    const removed = deferred<{ ok: true } | { ok: false; error: string }>();
    vi.mocked(removeTicketBlocker).mockReturnValue(removed.promise);
    renderWithTheme(
      <BlockerEditor
        ticketNumber={4}
        direction="blockedBy"
        related={[design, api]}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Blocker #3' }),
    );

    expect(removeTicketBlocker).toHaveBeenCalledExactlyOnceWith({
      blocker: 3,
      blocked: 4,
    });
    expect(shown('Blocked by')).toEqual(['#5 Build the API']);

    await act(async () =>
      removed.resolve({ ok: false, error: 'There is no Ticket #4.' }),
    );

    expect(shown('Blocked by')).toEqual([
      '#3 Design the header',
      '#5 Build the API',
    ]);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'There is no Ticket #4.',
    );
  });

  it('stops blocking a Ticket', async () => {
    vi.mocked(removeTicketBlocker).mockResolvedValue({ ok: true });
    renderWithTheme(
      <BlockerEditor ticketNumber={4} direction="blocks" related={[api]} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Stop blocking #5' }),
    );

    expect(removeTicketBlocker).toHaveBeenCalledExactlyOnceWith({
      blocker: 4,
      blocked: 5,
    });
  });
});
