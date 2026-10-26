import { act, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { InlineEdit, type InlineEditProps } from './inline-edit';

const renderEdit = (props: Partial<InlineEditProps> = {}) => {
  const onSave = vi
    .fn<InlineEditProps['onSave']>()
    .mockResolvedValue(undefined);
  const view = renderWithTheme(
    <InlineEdit
      value="Fix the header"
      label="Title"
      onSave={onSave}
      {...props}
    />,
  );
  return { ...view, onSave: props.onSave ?? onSave };
};

const text = () => screen.getByRole('button', { name: 'Fix the header' });
const input = () => screen.getByRole('textbox', { name: 'Title' });
const save = () => screen.getByRole('button', { name: 'Save' });
const cancel = () => screen.getByRole('button', { name: 'Cancel' });

/**
 * An `onSave` the test settles itself, to look at the field while the save
 * is pending. Settled after the test either way, so no transition is left
 * pending into the next test.
 */
const pendingSave = () => {
  const { promise, resolve } = Promise.withResolvers<string | undefined>();
  const onSave = vi.fn<InlineEditProps['onSave']>().mockReturnValue(promise);
  const settle = (reason?: string) => act(async () => resolve(reason));
  onTestFinished(() => settle());
  return { onSave, settle };
};

describe('InlineEdit', () => {
  it('shows the text alone at rest, with no buttons but the text itself', () => {
    renderEdit();

    expect(screen.getAllByRole('button')).toEqual([text()]);
    expect(text()).toHaveAccessibleDescription('Edit title');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('opens an input with Save and Cancel when the text is clicked', async () => {
    renderEdit();

    await userEvent.click(text());

    expect(input()).toHaveValue('Fix the header');
    expect(input()).toHaveFocus();
    expect(save()).toBeInTheDocument();
    expect(cancel()).toBeInTheDocument();
  });

  it('opens on Enter when the text has focus', async () => {
    renderEdit();

    text().focus();
    await userEvent.keyboard('{Enter}');

    expect(input()).toHaveValue('Fix the header');
  });

  it('closes on Enter at once, showing the new text before the save answers', async () => {
    const { onSave } = pendingSave();
    renderEdit({ onSave });

    await userEvent.click(text());
    await userEvent.clear(input());
    await userEvent.type(input(), 'Fix the footer{Enter}');

    expect(onSave).toHaveBeenCalledExactlyOnceWith('Fix the footer');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Fix the footer' }),
    ).toHaveFocus();
  });

  it('saves with the Save button', async () => {
    const { onSave } = pendingSave();
    renderEdit({ onSave });

    await userEvent.click(text());
    await userEvent.type(input(), '!');
    await userEvent.click(save());

    expect(onSave).toHaveBeenCalledExactlyOnceWith('Fix the header!');
    expect(
      screen.getByRole('button', { name: 'Fix the header!' }),
    ).toBeInTheDocument();
  });

  it('saves nothing when the text is unchanged', async () => {
    const { onSave } = renderEdit();

    await userEvent.click(text());
    await userEvent.keyboard('{Enter}');

    expect(onSave).not.toHaveBeenCalled();
    expect(text()).toHaveFocus();
  });

  it('cancels on Escape, keeping the Escape from the page, and drops the draft', async () => {
    const { onSave } = renderEdit();

    await userEvent.click(text());
    await userEvent.type(input(), '!');
    const onKeyDown = vi.fn();
    document.addEventListener('keydown', onKeyDown);
    onTestFinished(() => document.removeEventListener('keydown', onKeyDown));
    await userEvent.keyboard('{Escape}');

    expect(onKeyDown).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
    expect(text()).toHaveFocus();
    await userEvent.click(text());
    expect(input()).toHaveValue('Fix the header');
  });

  it('cancels with the Cancel button', async () => {
    const { onSave } = renderEdit();

    await userEvent.click(text());
    await userEvent.type(input(), '!');
    await userEvent.click(cancel());

    expect(onSave).not.toHaveBeenCalled();
    expect(text()).toHaveFocus();
  });

  it('stays open when the input loses focus', async () => {
    const { onSave } = renderEdit();

    await userEvent.click(text());
    await userEvent.type(input(), '!');
    input().blur();

    expect(onSave).not.toHaveBeenCalled();
    expect(input()).toHaveValue('Fix the header!');
  });

  it("reopens a refused text with the User's text and the reason", async () => {
    const { onSave, settle } = pendingSave();
    renderEdit({ onSave });

    await userEvent.click(text());
    await userEvent.clear(input());
    await userEvent.keyboard('{Enter}');
    await settle('Enter a title.');

    expect(input()).toHaveValue('');
    expect(input()).toHaveAccessibleDescription('Enter a title.');
  });

  it('saves again after a refused text is corrected', async () => {
    const onSave = vi
      .fn<InlineEditProps['onSave']>()
      .mockResolvedValueOnce('Enter a title.')
      .mockResolvedValueOnce(undefined);
    renderEdit({ onSave });

    await userEvent.click(text());
    await userEvent.clear(input());
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveValue(
      '',
    );
    await userEvent.type(input(), 'Fix the footer{Enter}');

    expect(onSave).toHaveBeenLastCalledWith('Fix the footer');
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it('drops a refused reason when the edit is cancelled', async () => {
    const onSave = vi
      .fn<InlineEditProps['onSave']>()
      .mockResolvedValue('Enter a title.');
    renderEdit({ onSave });

    await userEvent.click(text());
    await userEvent.clear(input());
    await userEvent.keyboard('{Enter}');
    await screen.findByText('Enter a title.');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(text());

    expect(input()).toHaveValue('Fix the header');
    expect(input()).not.toHaveAccessibleDescription();
    expect(screen.queryByText('Enter a title.')).not.toBeInTheDocument();
  });

  it('follows a value changed elsewhere unless it is being edited', async () => {
    const onSave = vi.fn<InlineEditProps['onSave']>();
    const { rerender } = renderEdit({ onSave });
    const show = (value: string) =>
      rerender(<InlineEdit value={value} label="Title" onSave={onSave} />);

    show('Fix the logo');
    await userEvent.click(screen.getByRole('button', { name: 'Fix the logo' }));
    await userEvent.type(input(), '!');
    show('Fix the menu');

    expect(input()).toHaveValue('Fix the logo!');
  });

  it('tells when an edit opens and ends, including a refused save reopening it', async () => {
    const { onSave, settle } = pendingSave();
    const onEditingChange = vi.fn<(editing: boolean) => void>();
    renderEdit({ onSave, onEditingChange });

    await userEvent.click(text());
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    await userEvent.keyboard('{Escape}');
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
    await userEvent.click(text());
    await userEvent.type(input(), '!{Enter}');
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
    await settle('Enter a title.');
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    expect(onEditingChange.mock.calls).toEqual([
      [true],
      [false],
      [true],
      [false],
      [true],
    ]);
  });

  it('wraps the text at rest, such as in a heading', () => {
    renderEdit({ renderText: (content) => <h2>{content}</h2> });

    expect(
      screen.getByRole('heading', { level: 2, name: 'Fix the header' }),
    ).toContainElement(text());
  });

  it('shows read-only text with no button that cannot be opened', async () => {
    renderEdit({
      readOnly: true,
      renderText: (content) => <h2>{content}</h2>,
    });

    expect(
      screen.getByRole('heading', { level: 2, name: 'Fix the header' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('Fix the header'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
