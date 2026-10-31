import { Dialog } from '@blockle/blocks';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { usePathname } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { currentConversationActivity } from '../../app/conversations/actions';
import { renderWithTheme } from '../../test/render';
import { ConversationActivityProvider } from '../conversation-activity/conversation-activity';
import { AppHeader } from './app-header';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));
vi.mock('../../app/conversations/actions', () => ({
  currentConversationActivity: vi.fn(),
}));

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

  it('links to the Stats page', () => {
    renderWithTheme(<AppHeader nav={nav} breadcrumbs={breadcrumbs} />);

    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Stats' })).toHaveAttribute(
      'href',
      '/stats',
    );
  });

  it('ends with the Colour mode button', () => {
    renderWithTheme(<AppHeader nav={nav} breadcrumbs={breadcrumbs} />);

    const header = screen.getByRole('banner');
    const buttons = within(header).getAllByRole('button');
    expect(buttons.at(-1)).toHaveAccessibleName('Colour mode');
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

  it('shows how many Conversations wait for the User', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue({
      running: [],
      needsYou: [4],
      needsYouCount: 3,
      needsYouByProject: {},
    });
    renderWithTheme(
      <ConversationActivityProvider>
        <AppHeader nav={nav} breadcrumbs={breadcrumbs} />
      </ConversationActivityProvider>,
    );

    expect(
      await within(screen.getByRole('banner')).findByText('3 need you'),
    ).toBeInTheDocument();
  });

  it('shows no count when no Conversation waits', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue({
      running: [],
      needsYou: [],
      needsYouCount: 0,
      needsYouByProject: {},
    });
    renderWithTheme(
      <ConversationActivityProvider>
        <AppHeader nav={nav} breadcrumbs={breadcrumbs} />
      </ConversationActivityProvider>,
    );

    await vi.waitFor(() =>
      expect(currentConversationActivity).toHaveBeenCalled(),
    );
    expect(screen.queryByText(/need you|needs you/)).not.toBeInTheDocument();
  });
});
