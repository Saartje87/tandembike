import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { removeConversationWorktree } from '../../app/conversations/actions';
import { renderWithTheme } from '../../test/render';
import {
  ConversationWorktree,
  type ConversationWorktreeProps,
} from './conversation-worktree';

vi.mock('../../app/conversations/actions', () => ({
  removeConversationWorktree: vi.fn(),
}));

const render = (values: Partial<ConversationWorktreeProps['conversation']>) =>
  renderWithTheme(
    <ConversationWorktree
      conversation={{
        id: 7,
        worktreePath: '/wt/1/c7',
        worktreeKept: null,
        worktreeRemoved: false,
        ...values,
      }}
    />,
  );

describe('ConversationWorktree', () => {
  beforeEach(() => {
    vi.mocked(removeConversationWorktree).mockReset();
  });

  it('shows the path while there is a worktree, with no button', () => {
    render({});

    expect(screen.getByText('Worktree: /wt/1/c7')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove worktree' }),
    ).not.toBeInTheDocument();
  });

  it('shows nothing without a worktree', () => {
    render({ worktreePath: null });

    expect(screen.queryByText(/Worktree/)).not.toBeInTheDocument();
  });

  it('shows nothing once the worktree is removed', () => {
    render({ worktreeRemoved: true, worktreeKept: 'dirty' });

    expect(screen.queryByText(/Worktree/)).not.toBeInTheDocument();
  });

  it('says a worktree was kept and why', () => {
    render({ worktreeKept: 'dirty' });

    expect(
      screen.getByText('Worktree kept: it has uncommitted changes.'),
    ).toBeInTheDocument();
  });

  it('removes only after the dialog is confirmed', async () => {
    vi.mocked(removeConversationWorktree).mockResolvedValue({
      ok: true,
      conversation: {} as never,
    });
    const user = userEvent.setup();
    render({ worktreeKept: 'unpushed' });

    await user.click(screen.getByRole('button', { name: 'Remove worktree' }));
    expect(removeConversationWorktree).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove worktree' }),
    );

    await waitFor(() =>
      expect(removeConversationWorktree).toHaveBeenCalledWith({
        conversationId: 7,
      }),
    );
  });

  it('shows the refusal in the dialog', async () => {
    vi.mocked(removeConversationWorktree).mockResolvedValue({
      ok: false,
      error: 'The worktree still has uncommitted changes.',
    });
    const user = userEvent.setup();
    render({ worktreeKept: 'dirty' });

    await user.click(screen.getByRole('button', { name: 'Remove worktree' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Remove worktree',
      }),
    );

    expect(
      await within(screen.getByRole('dialog')).findByText(
        'The worktree still has uncommitted changes.',
      ),
    ).toBeInTheDocument();
  });
});
