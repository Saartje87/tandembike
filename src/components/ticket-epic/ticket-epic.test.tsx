import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  attachTicketToEpic,
  detachTicketFromEpic,
} from '../../app/tickets/actions';
import { renderWithTheme } from '../../test/render';
import type { EpicLink } from '../../tickets/epic-link';
import { TicketEpic } from './ticket-epic';

vi.mock('../../app/tickets/actions', () => ({
  attachTicketToEpic: vi.fn(),
  detachTicketFromEpic: vi.fn(),
}));

const child = {
  number: 5,
  projectId: 1,
  epic: { number: 4, title: 'Checkout', color: 'teal' } as EpicLink,
};

describe('TicketEpic', () => {
  beforeEach(() => {
    vi.mocked(attachTicketToEpic).mockReset();
    vi.mocked(detachTicketFromEpic).mockReset();
  });

  it('links a child to its Epic', () => {
    renderWithTheme(<TicketEpic ticket={child} />);

    expect(screen.getByRole('link', { name: 'T4 Checkout' })).toHaveAttribute(
      'href',
      '/ticket/4',
    );
  });

  it('says when the Ticket is in no Epic', () => {
    renderWithTheme(<TicketEpic ticket={{ ...child, epic: null }} />);

    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('puts the Ticket back in its Epic and explains when detaching is refused', async () => {
    vi.mocked(detachTicketFromEpic).mockResolvedValue({
      ok: false,
      error: 'There is no Ticket T5.',
    });
    renderWithTheme(<TicketEpic ticket={child} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Detach from Epic' }),
    );

    expect(detachTicketFromEpic).toHaveBeenCalledExactlyOnceWith({ number: 5 });
    expect(
      await screen.findByText('There is no Ticket T5.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: 'T4 Checkout' }),
      ).toBeInTheDocument();
    });
  });

  describe('picking an Epic', () => {
    const epics: EpicLink[] = [
      { number: 4, title: 'Checkout', color: 'teal' },
      { number: 8, title: 'Search', color: 'teal' },
    ];
    const options = (name: string) =>
      screen
        .getAllByRole('option')
        .filter((option) =>
          screen.getByRole('combobox', { name }).contains(option),
        )
        .map((option) => option.textContent);

    it("offers a Ticket in no Epic the Project's Epics", () => {
      renderWithTheme(
        <TicketEpic ticket={{ ...child, epic: null }} epics={epics} />,
      );

      expect(options('Attach to Epic')).toEqual([
        'Attach to Epic…',
        'T4 Checkout',
        'T8 Search',
      ]);
    });

    it('attaches the Ticket to the picked Epic, showing it at once', async () => {
      let finish: (result: { ok: true }) => void = () => {};
      vi.mocked(attachTicketToEpic).mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      renderWithTheme(
        <TicketEpic ticket={{ ...child, epic: null }} epics={epics} />,
      );

      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: 'Attach to Epic' }),
        'T8 Search',
      );

      expect(attachTicketToEpic).toHaveBeenCalledExactlyOnceWith({
        epic: 8,
        child: 5,
      });
      expect(
        screen.getByRole('link', { name: 'T8 Search' }),
      ).toBeInTheDocument();
      finish({ ok: true });
    });

    it('moves a child to another of the Epics, beside Detach', async () => {
      vi.mocked(attachTicketToEpic).mockResolvedValue({ ok: true });
      renderWithTheme(<TicketEpic ticket={child} epics={epics} />);

      expect(options('Move to another Epic')).toEqual([
        'Move to another Epic…',
        'T8 Search',
      ]);
      expect(
        screen.getByRole('button', { name: 'Detach from Epic' }),
      ).toBeInTheDocument();

      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: 'Move to another Epic' }),
        'T8 Search',
      );

      expect(attachTicketToEpic).toHaveBeenCalledExactlyOnceWith({
        epic: 8,
        child: 5,
      });
    });

    it('puts the Ticket back and explains when attaching is refused', async () => {
      vi.mocked(attachTicketToEpic).mockResolvedValue({
        ok: false,
        error: 'Epic T8 is archived. Restore it before adding Tickets to it.',
      });
      renderWithTheme(
        <TicketEpic ticket={{ ...child, epic: null }} epics={epics} />,
      );

      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: 'Attach to Epic' }),
        'T8 Search',
      );

      expect(
        await screen.findByText(
          'Epic T8 is archived. Restore it before adding Tickets to it.',
        ),
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('None')).toBeInTheDocument();
      });
    });

    it('offers no picker when there is no other Epic to pick', () => {
      renderWithTheme(
        <TicketEpic
          ticket={child}
          epics={[{ number: 4, title: 'Checkout', color: 'teal' }]}
        />,
      );

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });
  });
});
