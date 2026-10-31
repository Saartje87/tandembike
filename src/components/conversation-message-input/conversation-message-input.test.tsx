import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { ConversationMessageInput } from './conversation-message-input';

const skills = ['/mattpocock-skills:grilling', '/mattpocock-skills:to-spec'];

const renderInput = (
  props: Partial<Parameters<typeof ConversationMessageInput>[0]> = {},
) => {
  const onSend = vi.fn().mockResolvedValue({ ok: true });
  const onTextChange = vi.fn();
  renderWithTheme(
    <ConversationMessageInput
      label="Reply"
      placeholder="Reply"
      rows={2}
      skills={skills}
      onSend={onSend}
      onTextChange={onTextChange}
      {...props}
    />,
  );
  return { onSend, onTextChange, field: screen.getByRole('textbox') };
};

describe('ConversationMessageInput Skills', () => {
  it('shows a chip per Skill with its short name, named by its command', () => {
    renderInput();

    const chips = screen.getByRole('group', { name: 'Skills' });
    const chip = screen.getByRole('button', {
      name: '/mattpocock-skills:grilling',
    });
    expect(chips).toContainElement(chip);
    expect(chip).toHaveTextContent('grilling');
    expect(chip).toHaveAttribute('title', '/mattpocock-skills:grilling');
    expect(
      screen.getByRole('button', { name: '/mattpocock-skills:to-spec' }),
    ).toHaveTextContent('to-spec');
  });

  it('shows no Skills row without Skills', () => {
    renderInput({ skills: [] });

    expect(screen.queryByRole('group', { name: 'Skills' })).toBeNull();
  });

  it('puts the command at the start of the text, focused, without sending', async () => {
    const user = userEvent.setup();
    const { onSend, onTextChange, field } = renderInput();
    await user.type(field, 'the header');
    await user.click(document.body);

    await user.click(
      screen.getByRole('button', { name: '/mattpocock-skills:grilling' }),
    );

    expect(field).toHaveValue('/mattpocock-skills:grilling the header');
    expect(field).toHaveFocus();
    expect((field as HTMLTextAreaElement).selectionStart).toBe(
      '/mattpocock-skills:grilling the header'.length,
    );
    expect(onTextChange).toHaveBeenLastCalledWith(
      '/mattpocock-skills:grilling the header',
    );
    expect(onSend).not.toHaveBeenCalled();
  });

  it('replaces a command already at the start', async () => {
    const user = userEvent.setup();
    const { field } = renderInput();
    await user.click(
      screen.getByRole('button', { name: '/mattpocock-skills:grilling' }),
    );
    await user.type(field, 'the header');

    await user.click(
      screen.getByRole('button', { name: '/mattpocock-skills:to-spec' }),
    );

    expect(field).toHaveValue('/mattpocock-skills:to-spec the header');
  });
});
