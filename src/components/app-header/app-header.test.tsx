import { Dialog } from '@blockle/blocks';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { usePathname } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Conversation,
  OpenConversation,
} from '../../conversations/conversations';
import { renderWithTheme } from '../../test/render';
import { useConversationDialog } from '../conversation-dialog-provider/conversation-dialog-provider';
import { AppHeader } from './app-header';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));
vi.mock('../conversation-dialog-provider/conversation-dialog-provider', () => ({
  useConversationDialog: vi.fn(),
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
    vi.mocked(useConversationDialog).mockReturnValue({
      conversations: [],
      open: vi.fn(),
      show: vi.fn(),
      reopenAndOpen: vi.fn(),
    });
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

  describe('Conversations button', () => {
    const open = (
      state: Conversation['state'],
      id: number,
    ): OpenConversation => ({
      conversation: { id, state } as Conversation,
      ticketTitle: null,
      projectName: 'Website',
      firstMessage: 'Hi',
    });
    const withConversations = (conversations: OpenConversation[]) => {
      const control = {
        conversations,
        open: vi.fn(),
        show: vi.fn(),
        reopenAndOpen: vi.fn(),
      };
      vi.mocked(useConversationDialog).mockReturnValue(control);
      return control;
    };

    it('is hidden when no Conversation is open', () => {
      withConversations([]);
      renderWithTheme(<AppHeader nav={nav} breadcrumbs={breadcrumbs} />);

      expect(
        screen.queryByRole('button', { name: /Conversations/ }),
      ).not.toBeInTheDocument();
    });

    it('shows how many are open and how many need the User, and shows the dialog', async () => {
      const control = withConversations([
        open('running', 1),
        open('waiting', 2),
        open('idle', 3),
        open('stopped', 4),
      ]);
      renderWithTheme(<AppHeader nav={nav} breadcrumbs={breadcrumbs} />);

      const button = screen.getByRole('button', {
        name: /^Conversations · 4 open\s*2 need you$/,
      });
      await userEvent.click(button);

      expect(control.show).toHaveBeenCalledOnce();
    });

    it('shows only the open count when none needs the User', () => {
      withConversations([open('running', 1)]);
      renderWithTheme(<AppHeader nav={nav} breadcrumbs={breadcrumbs} />);

      expect(
        screen.getByRole('button', { name: 'Conversations · 1 open' }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/need you|needs you/)).not.toBeInTheDocument();
    });
  });
});
