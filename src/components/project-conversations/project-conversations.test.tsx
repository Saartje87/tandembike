import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { currentConversationActivity } from '../../app/conversations/actions';
import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import { ConversationActivityProvider } from '../conversation-activity/conversation-activity';
import { ProjectConversations } from './project-conversations';

const pathname = vi.hoisted(() => ({ current: '/project/3/cycle/7' }));
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useSearchParams: () =>
    new URLSearchParams(
      pathname.current.endsWith('settings') ? '' : 'q=a&label=bug',
    ),
}));

vi.mock('../../app/conversations/actions', () => ({
  currentConversationActivity: vi.fn(),
}));
vi.mock('../live-updates/live-updates', () => ({
  useConversationRevision: () => 0,
}));

showOpenPopovers();

const items = [
  {
    id: 9,
    intent: 'new_ticket' as const,
    state: 'running' as const,
    title: 'Add coupons',
  },
  {
    id: 4,
    intent: 'new_ticket' as const,
    state: 'idle' as const,
    title: 'Fix header',
  },
];

describe('ProjectConversations', () => {
  beforeEach(() => {
    pathname.current = '/project/3/cycle/7';
  });

  it('shows the count of open Conversations on its button', () => {
    renderWithTheme(<ProjectConversations projectId={3} items={items} />);

    expect(
      screen.getByRole('button', { name: 'Conversations (2)' }),
    ).toBeInTheDocument();
  });

  it('shows how many Conversations of the Project need the User', async () => {
    vi.mocked(currentConversationActivity).mockResolvedValue({
      running: [],
      needsYou: [],
      needsYouCount: 5,
      needsYouByProject: { 3: 2, 8: 3 },
    });
    renderWithTheme(
      <ConversationActivityProvider>
        <ProjectConversations projectId={3} items={items} />
      </ConversationActivityProvider>,
    );

    expect(
      await screen.findByRole('button', {
        name: 'Conversations (2), 2 need you',
      }),
    ).toBeInTheDocument();
  });

  it('lists them to return to, over the Board on screen with its filter', async () => {
    renderWithTheme(<ProjectConversations projectId={3} items={items} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Conversations (2)' }),
    );

    expect(screen.getByRole('link', { name: /Add coupons/ })).toHaveAttribute(
      'href',
      '/project/3/cycle/7?q=a&label=bug&conversation=9',
    );
    expect(screen.getByRole('link', { name: /Fix header/ })).toHaveTextContent(
      'waiting for you',
    );
  });

  it('says so when there are none', async () => {
    renderWithTheme(<ProjectConversations projectId={3} items={[]} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Conversations' }),
    );

    expect(screen.getByText('No open Conversations.')).toBeInTheDocument();
  });

  it("opens over the Project's Board when on another page of it", async () => {
    pathname.current = '/project/3/settings';
    renderWithTheme(<ProjectConversations projectId={3} items={items} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Conversations (2)' }),
    );

    expect(screen.getByRole('link', { name: /Add coupons/ })).toHaveAttribute(
      'href',
      '/project/3?conversation=9',
    );
  });
});
