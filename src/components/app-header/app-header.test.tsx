import { Dialog } from '@blockle/blocks';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { usePathname } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { AppHeader } from './app-header';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));

// The link navigates on the client, as a Next.js `Link` does.
const nav = (
  <nav aria-label="Projects">
    <a href="/project/1" onClick={(event) => event.preventDefault()}>
      Website
    </a>
  </nav>
);

const breadcrumbs = <nav aria-label="Breadcrumb">Projects</nav>;

describe('AppHeader', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReturnValue('/project/1');
  });

  it('shows a menu button followed by the breadcrumbs, without an app name', () => {
    renderWithTheme(<AppHeader nav={nav} breadcrumbs={breadcrumbs} />);

    const header = screen.getByRole('banner');
    const menu = within(header).getByRole('button', {
      name: 'Open navigation',
    });
    const trail = within(header).getByRole('navigation', {
      name: 'Breadcrumb',
    });
    expect(menu.compareDocumentPosition(trail)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(within(header).queryByText('Tandembike')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the navigation in a drawer and closes it on Escape', async () => {
    renderWithTheme(<AppHeader nav={nav} breadcrumbs={breadcrumbs} />);
    const menu = screen.getByRole('button', { name: 'Open navigation' });

    await userEvent.click(menu);
    const drawer = screen.getByRole('dialog', { name: 'Navigation' });
    expect(
      within(drawer).getByRole('navigation', { name: 'Projects' }),
    ).toBeInTheDocument();
    expect(menu).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveFocus();
  });

  it('closes the drawer on a click outside it', async () => {
    renderWithTheme(<AppHeader nav={nav} breadcrumbs={breadcrumbs} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Open navigation' }),
    );
    // The Drawer starts listening for outside clicks on the next frame.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // Its backdrop lets clicks through to the page behind it.
    await userEvent.click(document.body);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the drawer when a link in it is picked', async () => {
    renderWithTheme(<AppHeader nav={nav} breadcrumbs={breadcrumbs} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Open navigation' }),
    );

    await userEvent.click(screen.getByRole('link', { name: 'Website' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the drawer when the page changes, as after creating a Project', async () => {
    const { rerender } = renderWithTheme(
      <AppHeader nav={nav} breadcrumbs={breadcrumbs} />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Open navigation' }),
    );

    vi.mocked(usePathname).mockReturnValue('/project/2');
    rerender(<AppHeader nav={nav} breadcrumbs={breadcrumbs} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('stays open on Escape while a dialog inside it is open', async () => {
    renderWithTheme(
      <AppHeader
        nav={
          <Dialog open onRequestClose={() => {}} aria-label="New Project">
            <input aria-label="Project name" />
          </Dialog>
        }
        breadcrumbs={breadcrumbs}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Open navigation' }),
    );

    await userEvent.keyboard('{Escape}');

    expect(
      screen.getByRole('dialog', { name: 'Navigation' }),
    ).toBeInTheDocument();
  });
});
