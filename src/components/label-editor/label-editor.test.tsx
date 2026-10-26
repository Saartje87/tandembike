import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

import { addTicketLabel, removeTicketLabel } from '../../app/tickets/actions';
import { renderWithTheme } from '../../test/render';
import { LabelEditor } from './label-editor';

vi.mock('../../app/tickets/actions', () => ({
  addTicketLabel: vi.fn(),
  removeTicketLabel: vi.fn(),
}));

const labelsShown = () =>
  within(screen.getByRole('list', { name: 'Labels' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

/** A promise the test settles itself, to look at the UI while it is pending. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const labelSelect = () => screen.getByRole('combobox', { name: 'Add a label' });

describe('LabelEditor', () => {
  beforeEach(() => {
    vi.mocked(addTicketLabel).mockReset();
    vi.mocked(removeTicketLabel).mockReset();
  });

  it("shows the Ticket's labels", () => {
    renderWithTheme(
      <LabelEditor ticketNumber={4} labels={['bug']} suggestions={[]} />,
    );

    expect(labelsShown()).toEqual(['bug']);
  });

  it('offers only existing labels that are not already assigned', () => {
    renderWithTheme(
      <LabelEditor
        ticketNumber={4}
        labels={['bug']}
        suggestions={['bug', 'enhancement', 'needs-triage']}
      />,
    );

    expect(
      within(labelSelect())
        .getAllByRole('option')
        .map((option) => option.getAttribute('value')),
    ).toEqual(['', 'enhancement', 'needs-triage']);
  });

  it('disables adding when there are no other existing labels', () => {
    renderWithTheme(
      <LabelEditor ticketNumber={4} labels={['bug']} suggestions={['bug']} />,
    );

    expect(labelSelect()).toBeDisabled();
    expect(labelSelect()).toHaveTextContent('No labels to add');
  });

  it('adds a selected label immediately and shows it while saving', async () => {
    const saved = deferred<{ ok: true }>();
    vi.mocked(addTicketLabel).mockReturnValue(saved.promise);
    renderWithTheme(
      <LabelEditor
        ticketNumber={4}
        labels={['bug']}
        suggestions={['needs-triage']}
      />,
    );
    await userEvent.selectOptions(labelSelect(), 'needs-triage');

    expect(addTicketLabel).toHaveBeenCalledExactlyOnceWith({
      number: 4,
      label: 'needs-triage',
    });
    expect(labelsShown()).toEqual(['bug', 'needs-triage']);

    await act(async () => saved.resolve({ ok: true }));
  });

  it('shows the reason when adding an existing label is refused', async () => {
    vi.mocked(addTicketLabel).mockResolvedValue({
      ok: false,
      error: 'The label could not be added.',
      fieldErrors: { labels: 'Labels are not valid.' },
    });
    renderWithTheme(
      <LabelEditor
        ticketNumber={4}
        labels={[]}
        suggestions={['needs-triage']}
      />,
    );

    await userEvent.selectOptions(labelSelect(), 'needs-triage');

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Labels are not valid.',
    );
    expect(screen.queryByRole('list', { name: 'Labels' })).toBeNull();
  });

  it('takes a removed label away at once', async () => {
    // Settled at the end: React holds every pending async transition
    // together, so one left pending would hold up later tests.
    const saved = deferred<{ ok: true }>();
    vi.mocked(removeTicketLabel).mockReturnValue(saved.promise);
    renderWithTheme(
      <LabelEditor
        ticketNumber={4}
        labels={['bug', 'needs-triage']}
        suggestions={[]}
      />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove label bug' }),
    );

    expect(removeTicketLabel).toHaveBeenCalledExactlyOnceWith({
      number: 4,
      label: 'bug',
    });
    expect(labelsShown()).toEqual(['needs-triage']);

    await act(async () => saved.resolve({ ok: true }));
  });

  // The drawer closes on a document click whose target has left the dialog,
  // and the removed label's button is gone by the time the click gets there.
  it('keeps the click that removes a label from reaching the document', async () => {
    vi.mocked(removeTicketLabel).mockResolvedValue({ ok: true });
    const onDocumentClick = vi.fn();
    document.addEventListener('click', onDocumentClick);
    onTestFinished(() =>
      document.removeEventListener('click', onDocumentClick),
    );
    renderWithTheme(
      <LabelEditor ticketNumber={4} labels={['bug']} suggestions={[]} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove label bug' }),
    );

    expect(onDocumentClick).not.toHaveBeenCalled();
  });

  it('explains a refused removal and shows the label again', async () => {
    vi.mocked(removeTicketLabel).mockResolvedValue({
      ok: false,
      error: 'There is no Ticket T4.',
    });
    renderWithTheme(
      <LabelEditor ticketNumber={4} labels={['bug']} suggestions={[]} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove label bug' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'There is no Ticket T4.',
    );
    await waitFor(() => expect(labelsShown()).toEqual(['bug']));
  });
});
