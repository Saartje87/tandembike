import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateTicket } from '../../app/tickets/actions';
import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import { EpicColorPicker } from './epic-color-picker';

vi.mock('../../app/tickets/actions', () => ({ updateTicket: vi.fn() }));
showOpenPopovers();

const swatches = () => within(screen.getByRole('group', { name: 'Colour' }));
const pressed = () =>
  swatches()
    .getAllByRole('button', { pressed: true })
    .map((button) => button.getAttribute('aria-label'));

describe('EpicColorPicker', () => {
  beforeEach(() => {
    vi.mocked(updateTicket).mockReset();
  });

  it("names the Epic's colour and offers the palette, with no Default", async () => {
    renderWithTheme(<EpicColorPicker epic={{ number: 8, color: 'teal' }} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Epic colour: Teal' }),
    );

    expect(pressed()).toEqual(['Teal']);
    expect(
      swatches().queryByRole('button', { name: 'Default' }),
    ).not.toBeInTheDocument();
    expect(swatches().getAllByRole('button')).toHaveLength(10);
  });

  it('saves a pick at once, showing it while the popover stays open', async () => {
    const { promise, resolve } = Promise.withResolvers<{
      ok: true;
      projectId: number;
    }>();
    vi.mocked(updateTicket).mockReturnValue(promise);
    renderWithTheme(<EpicColorPicker epic={{ number: 8, color: 'teal' }} />);

    await userEvent.click(screen.getByRole('button', { name: /^Epic colour/ }));
    await userEvent.click(swatches().getByRole('button', { name: 'Pink' }));

    expect(updateTicket).toHaveBeenCalledExactlyOnceWith({
      number: 8,
      color: 'pink',
    });
    expect(pressed()).toEqual(['Pink']);
    expect(
      screen.getByRole('button', { name: 'Epic colour: Pink' }),
    ).toBeInTheDocument();
    await act(async () => resolve({ ok: true, projectId: 1 }));
  });

  it('puts the colour back and explains when the pick is refused', async () => {
    vi.mocked(updateTicket).mockResolvedValue({
      ok: false,
      error: 'There is no Ticket #8.',
    });
    renderWithTheme(<EpicColorPicker epic={{ number: 8, color: 'teal' }} />);

    await userEvent.click(screen.getByRole('button', { name: /^Epic colour/ }));
    await userEvent.click(swatches().getByRole('button', { name: 'Pink' }));

    expect(
      await within(
        screen.getByRole('dialog', { name: 'Epic colour' }),
      ).findByRole('alert'),
    ).toHaveTextContent('There is no Ticket #8.');
    await waitFor(() => expect(pressed()).toEqual(['Teal']));
  });

  it('closes on Escape without letting it reach the drawer', async () => {
    const drawerEscape = vi.fn();
    document.addEventListener('keydown', drawerEscape);
    renderWithTheme(<EpicColorPicker epic={{ number: 8, color: 'teal' }} />);

    await userEvent.click(screen.getByRole('button', { name: /^Epic colour/ }));
    await userEvent.keyboard('{Escape}');

    expect(
      screen.queryByRole('group', { name: 'Colour' }),
    ).not.toBeInTheDocument();
    expect(drawerEscape).not.toHaveBeenCalled();
    document.removeEventListener('keydown', drawerEscape);
  });
});
