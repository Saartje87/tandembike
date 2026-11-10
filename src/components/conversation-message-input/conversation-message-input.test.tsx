import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { ConversationMessageInput } from './conversation-message-input';

const renderInput = (
  props: Partial<Parameters<typeof ConversationMessageInput>[0]> = {},
) => {
  const onSend = vi.fn().mockResolvedValue({ ok: true });
  const onTextChange = vi.fn();
  renderWithTheme(
    <ConversationMessageInput
      label="Reply"
      placeholder="Reply"
      onSend={onSend}
      onTextChange={onTextChange}
      {...props}
    />,
  );
  return { onSend, onTextChange, field: screen.getByRole('textbox') };
};

describe('ConversationMessageInput', () => {
  it('starts at one row, with Send', () => {
    const { field } = renderInput();

    expect(field).toHaveAttribute('rows', '1');
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });
});

describe('ConversationMessageInput refusals', () => {
  it('shows a refusal as an alert and keeps the text', async () => {
    const user = userEvent.setup();
    const { field } = renderInput({
      onSend: vi.fn().mockResolvedValue({ ok: false, error: 'Not now.' }),
    });

    await user.type(field, 'More{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Not now.');
    expect(field).toHaveValue('More');
  });

  it('shows a send that throws as an alert, not an uncaught rejection (T1185)', async () => {
    const user = userEvent.setup();
    const { field } = renderInput({
      onSend: vi.fn().mockRejectedValue(new Error('Server Action failed')),
    });

    await user.type(field, 'More{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'could not be sent',
    );
    expect(field).toHaveValue('More');
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
  });
});
