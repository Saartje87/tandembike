import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { colorModeStorageKey, writeColorMode } from '../../app/lib/color-mode';
import { ColorModeProvider } from './color-mode-provider';

const html = document.documentElement;

afterEach(() => {
  localStorage.clear();
});

describe('ColorModeProvider', () => {
  it('follows the OS without a stored choice', () => {
    render(<ColorModeProvider>Board</ColorModeProvider>);

    expect(screen.getByText('Board')).toBeInTheDocument();
    expect(html).toHaveAttribute('data-color-mode', 'system');
  });

  it('applies the stored choice', () => {
    localStorage.setItem(colorModeStorageKey, 'dark');

    render(<ColorModeProvider>Board</ColorModeProvider>);

    expect(html).toHaveAttribute('data-color-mode', 'dark');
  });

  it('applies a new choice at once', () => {
    render(<ColorModeProvider>Board</ColorModeProvider>);

    act(() => writeColorMode('light'));

    expect(html).toHaveAttribute('data-color-mode', 'light');
  });

  it('applies a choice made in another tab', () => {
    render(<ColorModeProvider>Board</ColorModeProvider>);

    act(() => {
      localStorage.setItem(colorModeStorageKey, 'dark');
      window.dispatchEvent(
        new StorageEvent('storage', { key: colorModeStorageKey }),
      );
    });

    expect(html).toHaveAttribute('data-color-mode', 'dark');
  });
});
