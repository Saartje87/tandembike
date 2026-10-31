import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import {
  checkTicketAcceptanceCriterion,
  setTicketAcceptanceCriteria,
} from '../../app/tickets/actions';
import { keyboardDrag, stubDragAndDrop } from '../../test/drag-and-drop';
import { renderWithTheme } from '../../test/render';
import type { AcceptanceCriterion } from '../../tickets/tickets';
import { AcceptanceCriteriaEditor } from './acceptance-criteria-editor';

vi.mock('../../app/tickets/actions', () => ({
  checkTicketAcceptanceCriterion: vi.fn(),
  setTicketAcceptanceCriteria: vi.fn(),
}));

stubDragAndDrop();

const logo: AcceptanceCriterion = {
  id: 1,
  text: 'The logo is centred',
  checked: true,
};
const menu: AcceptanceCriterion = {
  id: 2,
  text: 'The menu collapses on phones',
  checked: false,
};
const sticky: AcceptanceCriterion = {
  id: 3,
  text: 'The header is sticky',
  checked: false,
};

/** A promise the test settles itself, to look at the UI while it is pending. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** Each criterion shown, in order, with whether it is checked. */
const criteriaShown = () =>
  within(screen.getByRole('list', { name: 'Acceptance criteria' }))
    .getAllByRole('listitem')
    .map((item) => ({
      text: within(item).getByRole('button', {
        description: 'Edit acceptance criterion',
      }).textContent,
      checked: (within(item).getByRole('checkbox') as HTMLInputElement).checked,
    }));

const removeButton = (text: string) =>
  screen.getByRole('button', { name: `Remove criterion: ${text}` });

/** Removes the criterion with `text`, confirming it. */
const removeCriterion = async (text: string) => {
  await userEvent.click(removeButton(text));
  await userEvent.click(
    screen.getByRole('button', { name: 'Remove criterion' }),
  );
};

/**
 * Drags the criterion with `text` by keyboard: lifts its handle, presses
 * `keys`, and drops it. Each criterion is laid out 50px below the last.
 */
const dragCriterion = async (text: string, keys: string) => {
  const items = within(
    screen.getByRole('list', { name: 'Acceptance criteria' }),
  ).getAllByRole('listitem');
  const rects = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      const index = items.indexOf(this as HTMLLIElement);
      return index < 0
        ? new DOMRect(0, 0, 800, 700)
        : new DOMRect(0, index * 50, 300, 40);
    });
  onTestFinished(() => rects.mockRestore());
  await keyboardDrag(
    screen.getByRole('button', { name: `Drag criterion: ${text}` }),
    keys,
  );
};

describe('AcceptanceCriteriaEditor', () => {
  beforeEach(() => {
    vi.mocked(checkTicketAcceptanceCriterion).mockReset();
    vi.mocked(setTicketAcceptanceCriteria).mockReset();
  });

  it('shows each criterion as a checkbox, in order', () => {
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo, menu]} />,
    );

    expect(criteriaShown()).toEqual([
      { text: 'The logo is centred', checked: true },
      { text: 'The menu collapses on phones', checked: false },
    ]);
  });

  it('says there are none, and still offers to add one', () => {
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[]} />,
    );

    expect(screen.getByText('No acceptance criteria')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add criterion' }),
    ).toBeInTheDocument();
  });

  it('checks and unchecks a criterion at once, saving only its checked state', async () => {
    const saved = deferred<{ ok: true }>();
    vi.mocked(checkTicketAcceptanceCriterion).mockReturnValue(saved.promise);
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo, menu]} />,
    );

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'The menu collapses on phones' }),
    );

    expect(criteriaShown()).toEqual([
      { text: 'The logo is centred', checked: true },
      { text: 'The menu collapses on phones', checked: true },
    ]);
    expect(checkTicketAcceptanceCriterion).toHaveBeenCalledWith({
      number: 4,
      id: menu.id,
      checked: true,
    });
    await act(async () => saved.resolve({ ok: true }));
  });

  it('puts the checkbox back and says why when checking is refused', async () => {
    vi.mocked(checkTicketAcceptanceCriterion).mockResolvedValue({
      ok: false,
      error: 'There is no Ticket T4.',
    });
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo]} />,
    );

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'The logo is centred' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no Ticket T4.',
    );
    await waitFor(() =>
      expect(criteriaShown()).toEqual([
        { text: 'The logo is centred', checked: true },
      ]),
    );
  });

  it('removes a confirmed criterion at once and saves the rest of the list', async () => {
    const saved = deferred<{ ok: true }>();
    vi.mocked(setTicketAcceptanceCriteria).mockReturnValue(saved.promise);
    renderWithTheme(
      <AcceptanceCriteriaEditor
        ticketNumber={4}
        criteria={[logo, menu, sticky]}
      />,
    );

    await removeCriterion('The menu collapses on phones');

    expect(criteriaShown()).toEqual([
      { text: 'The logo is centred', checked: true },
      { text: 'The header is sticky', checked: false },
    ]);
    expect(setTicketAcceptanceCriteria).toHaveBeenCalledWith({
      number: 4,
      acceptanceCriteria: [
        { id: logo.id, text: logo.text },
        { id: sticky.id, text: sticky.text },
      ],
    });
    await act(async () => saved.resolve({ ok: true }));
  });

  it('asks before removing a criterion', async () => {
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo, menu]} />,
    );

    await userEvent.click(removeButton('The logo is centred'));

    expect(
      screen.getByText('Remove this criterion? It cannot be restored.'),
    ).toBeInTheDocument();
    expect(setTicketAcceptanceCriteria).not.toHaveBeenCalled();
  });

  it('keeps a criterion when its removal is cancelled', async () => {
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo, menu]} />,
    );

    await userEvent.click(removeButton('The logo is centred'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(removeButton('The logo is centred')).toHaveFocus();
    await userEvent.click(removeButton('The logo is centred'));
    await userEvent.keyboard('{Escape}');

    expect(removeButton('The logo is centred')).toHaveFocus();
    expect(criteriaShown()).toEqual([
      { text: 'The logo is centred', checked: true },
      { text: 'The menu collapses on phones', checked: false },
    ]);
    expect(setTicketAcceptanceCriteria).not.toHaveBeenCalled();
  });

  it('reorders a criterion by dragging its handle, saving the new order at once', async () => {
    const saved = deferred<{ ok: true }>();
    vi.mocked(setTicketAcceptanceCriteria).mockReturnValue(saved.promise);
    renderWithTheme(
      <AcceptanceCriteriaEditor
        ticketNumber={4}
        criteria={[logo, menu, sticky]}
      />,
    );

    await dragCriterion('The header is sticky', '{ArrowUp}');

    expect(criteriaShown().map(({ text }) => text)).toEqual([
      'The logo is centred',
      'The header is sticky',
      'The menu collapses on phones',
    ]);
    expect(setTicketAcceptanceCriteria).toHaveBeenCalledWith({
      number: 4,
      acceptanceCriteria: [
        { id: logo.id, text: logo.text },
        { id: sticky.id, text: sticky.text },
        { id: menu.id, text: menu.text },
      ],
    });
    await act(async () => saved.resolve({ ok: true }));
  });

  it('shows the old order again and says why when a reorder is refused', async () => {
    vi.mocked(setTicketAcceptanceCriteria).mockResolvedValue({
      ok: false,
      error: 'There is no Ticket T4.',
    });
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo, menu]} />,
    );

    await dragCriterion('The logo is centred', '{ArrowDown}');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no Ticket T4.',
    );
    await waitFor(() =>
      expect(criteriaShown().map(({ text }) => text)).toEqual([
        'The logo is centred',
        'The menu collapses on phones',
      ]),
    );
  });

  it('cannot drag a criterion while it is edited or about to be removed', async () => {
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo, menu]} />,
    );

    const dragButton = (text: string) =>
      screen.queryByRole('button', { name: `Drag criterion: ${text}` });

    await userEvent.click(screen.getByText('The logo is centred'));
    expect(dragButton('The logo is centred')).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(removeButton('The menu collapses on phones'));

    expect(dragButton('The menu collapses on phones')).not.toBeInTheDocument();
  });

  it('shows the list again and says why when a change is refused', async () => {
    vi.mocked(setTicketAcceptanceCriteria).mockResolvedValue({
      ok: false,
      error: 'There is no Ticket T4.',
    });
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo, menu]} />,
    );

    await removeCriterion('The logo is centred');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no Ticket T4.',
    );
    await waitFor(() =>
      expect(criteriaShown().map(({ text }) => text)).toEqual([
        'The logo is centred',
        'The menu collapses on phones',
      ]),
    );
  });

  const newCriterionInput = () =>
    screen.getByRole('textbox', { name: 'New acceptance criterion' });

  it('adds a criterion at the end, keeping the field open for the next', async () => {
    vi.mocked(setTicketAcceptanceCriteria).mockResolvedValue({ ok: true });
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo]} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Add criterion' }),
    );
    await userEvent.type(newCriterionInput(), 'The header is sticky{Enter}');

    expect(setTicketAcceptanceCriteria).toHaveBeenCalledWith({
      number: 4,
      acceptanceCriteria: [
        { id: logo.id, text: logo.text },
        { text: 'The header is sticky' },
      ],
    });
    expect(newCriterionInput()).toHaveValue('');
    expect(newCriterionInput()).toHaveFocus();
  });

  it('keeps the new criterion and says why when it is refused', async () => {
    vi.mocked(setTicketAcceptanceCriteria).mockResolvedValue({
      ok: false,
      error: 'Enter text for each acceptance criterion.',
      fieldErrors: {
        acceptanceCriteria: 'Enter text for each acceptance criterion.',
      },
    });
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[]} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Add criterion' }),
    );
    await userEvent.type(newCriterionInput(), '  {Enter}');

    await waitFor(() =>
      expect(newCriterionInput()).toHaveAccessibleDescription(
        'Enter text for each acceptance criterion.',
      ),
    );
    expect(newCriterionInput()).toHaveValue('  ');
  });

  it('closes the new criterion field on Escape', async () => {
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[]} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Add criterion' }),
    );
    await userEvent.type(newCriterionInput(), 'Half typed{Escape}');

    expect(
      screen.queryByRole('textbox', { name: 'New acceptance criterion' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add criterion' })).toHaveFocus();
    expect(setTicketAcceptanceCriteria).not.toHaveBeenCalled();
  });

  const editInput = () =>
    screen.getByRole('textbox', { name: 'Acceptance criterion' });
  const criterionText = (text: string) =>
    screen.getByRole('button', {
      name: text,
      description: 'Edit acceptance criterion',
    });

  it('edits a criterion with a Cancel icon button, hiding its remove button meanwhile', async () => {
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo, menu]} />,
    );

    await userEvent.click(criterionText('The logo is centred'));

    const item = editInput().closest('li') as HTMLElement;
    // Icon-only: named by its label, with no text of its own.
    expect(
      within(item).queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument();
    expect(
      within(item).getByRole('button', { name: 'Cancel' }),
    ).toHaveTextContent(/^$/);
    expect(
      screen.queryByRole('button', {
        name: 'Remove criterion: The logo is centred',
      }),
    ).not.toBeInTheDocument();
    expect(removeButton('The menu collapses on phones')).toBeInTheDocument();

    await userEvent.click(within(item).getByRole('button', { name: 'Cancel' }));

    expect(removeButton('The logo is centred')).toBeInTheDocument();
  });

  it('keeps the checkbox usable while the text is edited', async () => {
    vi.mocked(checkTicketAcceptanceCriterion).mockResolvedValue({ ok: true });
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[menu]} />,
    );

    await userEvent.click(criterionText('The menu collapses on phones'));
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'The menu collapses on phones' }),
    );

    expect(checkTicketAcceptanceCriterion).toHaveBeenCalledWith({
      number: 4,
      id: menu.id,
      checked: true,
    });
  });

  it('saves the text when focus leaves the input', async () => {
    const saved = deferred<{ ok: true }>();
    vi.mocked(setTicketAcceptanceCriteria).mockReturnValue(saved.promise);
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[menu]} />,
    );

    await userEvent.click(criterionText('The menu collapses on phones'));
    await userEvent.type(editInput(), ' fast');
    await userEvent.click(
      screen.getByRole('heading', { name: 'Acceptance criteria' }),
    );

    expect(
      screen.queryByRole('textbox', { name: 'Acceptance criterion' }),
    ).not.toBeInTheDocument();
    expect(setTicketAcceptanceCriteria).toHaveBeenCalledExactlyOnceWith({
      number: 4,
      acceptanceCriteria: [
        { id: menu.id, text: 'The menu collapses on phones fast' },
      ],
    });
    expect(
      criterionText('The menu collapses on phones fast'),
    ).toBeInTheDocument();
    await act(async () => saved.resolve({ ok: true }));
  });

  it('edits a criterion in place, showing it unchecked at once', async () => {
    const saved = deferred<{ ok: true }>();
    vi.mocked(setTicketAcceptanceCriteria).mockReturnValue(saved.promise);
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo, menu]} />,
    );

    await userEvent.click(criterionText('The logo is centred'));
    await userEvent.clear(editInput());
    await userEvent.type(editInput(), 'The logo is larger{Enter}');

    expect(criteriaShown()).toEqual([
      { text: 'The logo is larger', checked: false },
      { text: 'The menu collapses on phones', checked: false },
    ]);
    expect(setTicketAcceptanceCriteria).toHaveBeenCalledWith({
      number: 4,
      acceptanceCriteria: [
        { id: logo.id, text: 'The logo is larger' },
        { id: menu.id, text: menu.text },
      ],
    });
    await act(async () => saved.resolve({ ok: true }));
  });

  it('opens the edit field from a click on the text, without checking it', async () => {
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[menu]} />,
    );

    await userEvent.click(screen.getByText('The menu collapses on phones'));

    expect(editInput()).toHaveValue('The menu collapses on phones');
    expect(checkTicketAcceptanceCriterion).not.toHaveBeenCalled();
  });

  it('opens the edit field from the keyboard on the text', async () => {
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[menu]} />,
    );

    // Past the drag handle and the checkbox.
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(criterionText('The menu collapses on phones')).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(editInput()).toHaveFocus();
  });

  it('cancels an edit on Escape and saves nothing when the text is unchanged', async () => {
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo]} />,
    );
    const editButton = () => criterionText('The logo is centred');

    await userEvent.click(editButton());
    await userEvent.type(editInput(), ' and larger{Escape}');
    await userEvent.click(editButton());
    await userEvent.type(editInput(), '{Enter}');

    expect(criteriaShown()).toEqual([
      { text: 'The logo is centred', checked: true },
    ]);
    expect(setTicketAcceptanceCriteria).not.toHaveBeenCalled();
  });

  it('saves nothing, and keeps it checked, when only spaces were added around the text', async () => {
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo]} />,
    );

    await userEvent.click(criterionText('The logo is centred'));
    await userEvent.type(editInput(), '  {Enter}');

    expect(setTicketAcceptanceCriteria).not.toHaveBeenCalled();
    expect(criteriaShown()).toEqual([
      { text: 'The logo is centred', checked: true },
    ]);
  });

  it("reopens a refused edit with the User's text and the reason", async () => {
    vi.mocked(setTicketAcceptanceCriteria).mockResolvedValue({
      ok: false,
      error: 'Enter text for each acceptance criterion.',
      fieldErrors: {
        acceptanceCriteria: 'Enter text for each acceptance criterion.',
      },
    });
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo]} />,
    );

    await userEvent.click(criterionText('The logo is centred'));
    await userEvent.clear(editInput());
    await userEvent.type(editInput(), ' {Enter}');

    expect(
      await screen.findByRole('textbox', { name: 'Acceptance criterion' }),
    ).toHaveValue(' ');
    await waitFor(() =>
      expect(editInput()).toHaveAccessibleDescription(
        'Enter text for each acceptance criterion.',
      ),
    );
  });

  it('puts focus on the heading after removing a criterion', async () => {
    vi.mocked(setTicketAcceptanceCriteria).mockResolvedValue({ ok: true });
    renderWithTheme(
      <AcceptanceCriteriaEditor ticketNumber={4} criteria={[logo, menu]} />,
    );

    await removeCriterion('The logo is centred');

    expect(
      screen.getByRole('heading', { name: 'Acceptance criteria' }),
    ).toHaveFocus();
  });
});
