import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { colorModeStorageKey } from '../../app/lib/color-mode';
import { showOpenPopovers } from '../../test/popover';
import { ColorModeProvider } from '../color-mode-provider/color-mode-provider';
import { ColorModeMenu } from './color-mode-menu';

showOpenPopovers();

const renderMenu = () =>
  render(
    <ColorModeProvider>
      <ColorModeMenu />
    </ColorModeProvider>,
  );

const trigger = () => screen.getByRole('button', { name: 'Colour mode' });
const menu = () => screen.queryByRole('menu', { name: 'Colour mode' });

/** Each option the open menu offers, with whether it is the current one. */
const options = () =>
  within(screen.getByRole('menu', { name: 'Colour mode' }))
    .getAllByRole('menuitemradio')
    .map((item) => [item.textContent, item.getAttribute('aria-checked')]);

// jsdom has no `matchMedia`, which `useColorMode` reads under System: a
// light OS.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('ColorModeMenu', () => {
  it('offers Light, Dark and System, with System current by default', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(options()).toEqual([
      ['Light', 'false'],
      ['Dark', 'false'],
      ['System', 'true'],
    ]);
  });

  it('marks the stored choice as current', async () => {
    localStorage.setItem(colorModeStorageKey, 'light');
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());

    expect(options()).toEqual([
      ['Light', 'true'],
      ['Dark', 'false'],
      ['System', 'false'],
    ]);
  });

  it('applies and stores a picked mode, and closes', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());
    await user.click(screen.getByRole('menuitemradio', { name: 'Dark' }));

    expect(localStorage.getItem(colorModeStorageKey)).toBe('dark');
    expect(document.documentElement).toHaveAttribute('data-color-mode', 'dark');
    expect(menu()).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());
    await user.keyboard('{Escape}');

    expect(menu()).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveFocus();
  });

  it('moves between the options with the arrow keys', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(trigger());
    const [light, dark] = screen.getAllByRole('menuitemradio');
    light.focus();
    await user.keyboard('{ArrowDown}');

    expect(dark).toHaveFocus();
  });
});
