import { act, fireEvent, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { renderWithTheme } from '../../test/render';
import { InlineEdit, type InlineEditProps } from './inline-edit';

const renderEdit = (props: Partial<InlineEditProps> = {}) => {
  const onSave = vi
    .fn<InlineEditProps['onSave']>()
    .mockResolvedValue(undefined);
  const view = renderWithTheme(
    <>
      <InlineEdit
        value="Fix the header"
        label="Title"
        onSave={onSave}
        {...props}
      />
      <button type="button">Elsewhere</button>
    </>,
  );
  return { ...view, onSave: props.onSave ?? onSave };
};

const text = () => screen.getByRole('button', { name: 'Fix the header' });
const input = () => screen.getByRole('textbox', { name: 'Title' });
const cancel = () => screen.getByRole('button', { name: 'Cancel' });
const elsewhere = () => screen.getByRole('button', { name: 'Elsewhere' });

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

    expect(screen.getAllByRole('button')).toEqual([text(), elsewhere()]);
    expect(text()).toHaveAccessibleDescription('Edit title');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('opens an input with Cancel and no Save when the text is clicked', async () => {
    renderEdit();

    await userEvent.click(text());

    expect(input()).toHaveValue('Fix the header');
    expect(input()).toHaveFocus();
    expect(cancel()).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument();
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

  it('saves when focus moves elsewhere in the page, leaving focus there', async () => {
    const { onSave } = pendingSave();
    renderEdit({ onSave });

    await userEvent.click(text());
    await userEvent.type(input(), '!');
    await userEvent.click(elsewhere());

    expect(onSave).toHaveBeenCalledExactlyOnceWith('Fix the header!');
    expect(
      screen.getByRole('button', { name: 'Fix the header!' }),
    ).toBeInTheDocument();
    expect(elsewhere()).toHaveFocus();
  });

  it('saves when a click on the page takes focus to nothing', async () => {
    const { onSave } = pendingSave();
    renderEdit({ onSave });

    await userEvent.click(text());
    await userEvent.type(input(), '!');
    await userEvent.click(document.body);

    expect(onSave).toHaveBeenCalledExactlyOnceWith('Fix the header!');
  });

  it('shows the new text in the same update that closes the input', async () => {
    const { onSave } = pendingSave();
    renderEdit({ onSave });

    await userEvent.click(text());
    await userEvent.type(input(), '!');
    // A plain focus, not userEvent's: nothing awaits between it and the check.
    act(() => elsewhere().focus());

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
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

  it('just closes when focus leaves with the text unchanged', async () => {
    const { onSave } = renderEdit();

    await userEvent.click(text());
    await userEvent.type(input(), '!{Backspace}');
    await userEvent.click(elsewhere());

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(elsewhere()).toHaveFocus();
  });

  it('cancels on Escape, claiming the Escape from the page, and drops the draft', async () => {
    const { onSave } = renderEdit();

    await userEvent.click(text());
    await userEvent.type(input(), '!');
    const claimed = vi.fn();
    const onKeyDown = (event: KeyboardEvent) => claimed(event.defaultPrevented);
    document.addEventListener('keydown', onKeyDown);
    onTestFinished(() => document.removeEventListener('keydown', onKeyDown));
    await userEvent.keyboard('{Escape}');

    expect(claimed.mock.calls).toEqual([[true]]);
    expect(onSave).not.toHaveBeenCalled();
    expect(text()).toHaveFocus();
    await userEvent.click(text());
    expect(input()).toHaveValue('Fix the header');
  });

  it('cancels with the Cancel button, which does not count as leaving', async () => {
    const { onSave } = renderEdit();

    await userEvent.click(text());
    await userEvent.type(input(), '!');
    await userEvent.click(cancel());

    expect(onSave).not.toHaveBeenCalled();
    expect(text()).toHaveFocus();
  });

  it('does not save when Tab moves focus to Cancel, but does when it leaves', async () => {
    const { onSave } = pendingSave();
    renderEdit({ onSave });

    await userEvent.click(text());
    await userEvent.type(input(), '!');
    await userEvent.tab();
    expect(cancel()).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.tab();

    expect(onSave).toHaveBeenCalledExactlyOnceWith('Fix the header!');
    expect(elsewhere()).toHaveFocus();
  });

  // The window loses focus but the input stays the page's focused element.
  it('stays open, unsaved, when the window loses focus', async () => {
    const { onSave } = renderEdit();

    await userEvent.click(text());
    await userEvent.type(input(), '!');
    fireEvent.blur(input());

    expect(onSave).not.toHaveBeenCalled();
    expect(input()).toHaveValue('Fix the header!');
  });

  it("reopens a text refused after leaving with the User's text and the reason, without taking focus", async () => {
    const { onSave, settle } = pendingSave();
    renderEdit({ onSave });

    await userEvent.click(text());
    await userEvent.clear(input());
    await userEvent.click(elsewhere());
    await settle('Enter a title.');

    expect(input()).toHaveValue('');
    expect(input()).toHaveAccessibleDescription('Enter a title.');
    expect(elsewhere()).toHaveFocus();
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
    expect(input()).toHaveFocus();
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
    renderEdit({ wrap: (content) => <h2>{content}</h2> });

    expect(
      screen.getByRole('heading', { level: 2, name: 'Fix the header' }),
    ).toContainElement(text());
  });

  it('shows read-only text with no button that cannot be opened', async () => {
    renderEdit({
      readOnly: true,
      wrap: (content) => <h2>{content}</h2>,
    });

    expect(
      screen.getByRole('heading', { level: 2, name: 'Fix the header' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toEqual([elsewhere()]);
    await userEvent.click(screen.getByText('Fix the header'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  describe('textarea', () => {
    const renderTextarea = (props: Partial<InlineEditProps> = {}) =>
      renderEdit({
        value: 'It overlaps the logo.',
        label: 'Description',
        multiline: true,
        ...props,
      });
    const textarea = () => screen.getByRole('textbox', { name: 'Description' });

    it('opens a textarea when the text is clicked, where Enter adds a line', async () => {
      const { onSave } = renderTextarea();

      await userEvent.click(screen.getByText('It overlaps the logo.'));
      expect(textarea().tagName).toBe('TEXTAREA');
      expect(textarea()).toHaveFocus();
      await userEvent.type(textarea(), '{Enter}Use flex.');

      expect(textarea()).toHaveValue('It overlaps the logo.\nUse flex.');
      expect(onSave).not.toHaveBeenCalled();
    });

    it.each([
      ['Cmd', '{Meta>}{Enter}{/Meta}'],
      ['Ctrl', '{Control>}{Enter}{/Control}'],
    ])(
      'saves on %s+Enter and closes at once, showing the new text',
      async (_, keys) => {
        const { onSave } = pendingSave();
        renderTextarea({ onSave });

        await userEvent.click(screen.getByText('It overlaps the logo.'));
        await userEvent.type(textarea(), '!');
        await userEvent.keyboard(keys);

        expect(onSave).toHaveBeenCalledExactlyOnceWith(
          'It overlaps the logo.!',
        );
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(screen.getByText('It overlaps the logo.!')).toBeInTheDocument();
      },
    );

    it('cancels with Cancel below the textarea, and has no Save', async () => {
      const { onSave } = renderTextarea();

      await userEvent.click(screen.getByText('It overlaps the logo.'));
      expect(
        textarea().compareDocumentPosition(cancel()) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        screen.queryByRole('button', { name: 'Save' }),
      ).not.toBeInTheDocument();
      await userEvent.type(textarea(), '!');
      await userEvent.click(cancel());

      expect(onSave).not.toHaveBeenCalled();
    });

    it('cancels on Escape, claiming the Escape from the page, and puts focus back on the text', async () => {
      const { onSave } = renderTextarea();

      await userEvent.click(screen.getByText('It overlaps the logo.'));
      await userEvent.type(textarea(), '!');
      const claimed = vi.fn();
      const onKeyDown = (event: KeyboardEvent) =>
        claimed(event.defaultPrevented);
      document.addEventListener('keydown', onKeyDown);
      onTestFinished(() => document.removeEventListener('keydown', onKeyDown));
      await userEvent.keyboard('{Escape}');

      expect(claimed.mock.calls).toEqual([[true]]);
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.getByText('It overlaps the logo.')).toBeInTheDocument();
      expect(document.activeElement).toHaveAccessibleDescription(
        'Edit description',
      );
    });

    it('saves when focus moves elsewhere in the page, leaving focus there', async () => {
      const { onSave } = pendingSave();
      renderTextarea({ onSave });

      await userEvent.click(screen.getByText('It overlaps the logo.'));
      await userEvent.type(textarea(), '!');
      await userEvent.click(elsewhere());

      expect(onSave).toHaveBeenCalledExactlyOnceWith('It overlaps the logo.!');
      expect(screen.getByText('It overlaps the logo.!')).toBeInTheDocument();
      expect(elsewhere()).toHaveFocus();
    });

    it('stays open, unsaved, when the window loses focus', async () => {
      const { onSave } = renderTextarea();

      await userEvent.click(screen.getByText('It overlaps the logo.'));
      await userEvent.type(textarea(), '!');
      fireEvent.blur(textarea());

      expect(textarea()).toHaveValue('It overlaps the logo.!');
      expect(onSave).not.toHaveBeenCalled();
    });

    it('opens on Enter when the text has focus', async () => {
      renderTextarea();

      await userEvent.tab();
      expect(document.activeElement).toHaveAccessibleDescription(
        'Edit description',
      );
      await userEvent.keyboard('{Enter}');

      expect(textarea()).toHaveValue('It overlaps the logo.');
    });

    it('renders the text at rest, and follows a link in it instead of opening', async () => {
      const onLinkClick = vi.fn((event: MouseEvent) => event.preventDefault());
      renderTextarea({
        renderContent: (value) => (
          <p>
            {value} <a href="#docs">Docs</a>
          </p>
        ),
      });
      document.addEventListener('click', onLinkClick);
      onTestFinished(() => document.removeEventListener('click', onLinkClick));

      await userEvent.click(screen.getByRole('link', { name: 'Docs' }));

      expect(onLinkClick).toHaveBeenCalledOnce();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('follows a link on Enter instead of opening', async () => {
      renderTextarea({
        renderContent: (value) => (
          <p>
            {value} <a href="#docs">Docs</a>
          </p>
        ),
      });

      screen.getByRole('link', { name: 'Docs' }).focus();
      await userEvent.keyboard('{Enter}');

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('shows a placeholder for empty text that opens the textarea', async () => {
      renderTextarea({ value: '', placeholder: 'Add a description…' });

      await userEvent.click(screen.getByText('Add a description…'));

      expect(textarea()).toHaveValue('');
    });

    it("reopens a refused text with the User's text and the reason", async () => {
      const onSave = vi
        .fn<InlineEditProps['onSave']>()
        .mockResolvedValue('Too long.');
      renderTextarea({ onSave });

      await userEvent.click(screen.getByText('It overlaps the logo.'));
      await userEvent.type(textarea(), '!');
      await userEvent.click(elsewhere());

      expect(await screen.findByRole('textbox')).toHaveValue(
        'It overlaps the logo.!',
      );
      expect(textarea()).toHaveAccessibleDescription('Too long.');
      expect(elsewhere()).toHaveFocus();
    });
  });
});
