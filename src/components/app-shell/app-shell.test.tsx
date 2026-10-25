import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { usePathname } from 'next/navigation';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));

describe('AppShell', () => {
  it.each([
    '/',
    '/projects',
    '/project/42',
    '/project/42/cycle/7',
    '/ticket/7',
  ])('puts the navigation behind the header menu at %s', async (pathname) => {
    vi.mocked(usePathname).mockReturnValue(pathname);
    renderWithTheme(
      <AppShell
        nav={<nav aria-label="Projects">Projects</nav>}
        breadcrumbs={<nav aria-label="Breadcrumb">Projects</nav>}
      >
        Ticket tracker
      </AppShell>,
    );

    expect(screen.getByRole('main')).toHaveTextContent('Ticket tracker');
    expect(
      screen.queryByRole('navigation', { name: 'Projects' }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole('banner')).getByRole('button', {
        name: 'Open navigation',
      }),
    );
    expect(
      within(screen.getByRole('dialog')).getByRole('navigation', {
        name: 'Projects',
      }),
    ).toBeInTheDocument();
  });
});
