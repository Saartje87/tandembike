import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { answerConversationPermission } from '../../app/conversations/actions';
import type { PermissionStatus } from '../../conversations/conversation-state';
import { renderWithTheme } from '../../test/render';
import { ConversationPermissionPrompt } from './conversation-permission-prompt';

vi.mock('../../app/conversations/actions', () => ({
  answerConversationPermission: vi.fn(),
}));

const ok = { ok: true, conversation: {} } as never;

const renderPrompt = (
  permission: PermissionStatus,
  rules: string[] | null = null,
) =>
  renderWithTheme(
    <ConversationPermissionPrompt
      entryId={9}
      permission={permission}
      rules={rules}
    />,
  );

describe('ConversationPermissionPrompt', () => {
  beforeEach(() => {
    vi.mocked(answerConversationPermission).mockReset();
    vi.mocked(answerConversationPermission).mockResolvedValue(ok);
  });

  it('offers Allow and Deny, but not Always allow, without rules', async () => {
    renderPrompt('pending');

    expect(
      screen.queryByRole('button', { name: /Always allow/ }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Allow' }));
    expect(answerConversationPermission).toHaveBeenLastCalledWith({
      entryId: 9,
      answer: 'allow',
    });
    await userEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(answerConversationPermission).toHaveBeenLastCalledWith({
      entryId: 9,
      answer: 'deny',
    });
  });

  it('names the proposed rule on Always allow and sends allow-always', async () => {
    renderPrompt('pending', ['Bash(npm run check:*)']);

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Always allow Bash(npm run check:*)',
      }),
    );

    expect(answerConversationPermission).toHaveBeenCalledWith({
      entryId: 9,
      answer: 'allow-always',
    });
  });

  it('shows every proposed rule on the button', () => {
    renderPrompt('pending', ['Bash(git log:*)', 'Read']);

    expect(
      screen.getByRole('button', {
        name: 'Always allow Bash(git log:*), Read',
      }),
    ).toBeInTheDocument();
  });

  it('reads Always allowed with the rules once answered that way', () => {
    renderPrompt('always-allowed', ['Bash(npm run check:*)']);

    expect(screen.getByText(/Always allowed/)).toBeInTheDocument();
    expect(screen.getByText('Bash(npm run check:*)')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the other outcomes without buttons', () => {
    renderPrompt('allowed');

    expect(screen.getByText('Allowed')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows a refusal as an alert', async () => {
    vi.mocked(answerConversationPermission).mockResolvedValue({
      ok: false,
      error: 'This request is no longer waiting.',
    });
    renderPrompt('pending', ['Read']);

    await userEvent.click(
      screen.getByRole('button', { name: 'Always allow Read' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This request is no longer waiting.',
    );
  });
});
