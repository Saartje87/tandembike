import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addTicketExternalReference,
  removeTicketExternalReference,
} from '../../app/tickets/actions';
import { renderWithTheme } from '../../test/render';
import { ExternalReferenceEditor } from './external-reference-editor';

vi.mock('../../app/tickets/actions', () => ({
  addTicketExternalReference: vi.fn(),
  removeTicketExternalReference: vi.fn(),
}));

/** A promise the test settles itself, to look at the UI while it is pending. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const referencesShown = () =>
  within(screen.getByRole('list', { name: 'External references' }))
    .queryAllByRole('listitem')
    .map((item) => item.textContent);

describe('ExternalReferenceEditor', () => {
  beforeEach(() => {
    vi.mocked(addTicketExternalReference).mockReset();
    vi.mocked(removeTicketExternalReference).mockReset();
  });

  it('opens a URL in a new tab with derived text, and shows a key as plain text', () => {
    renderWithTheme(
      <ExternalReferenceEditor
        ticketNumber={4}
        references={[
          'https://github.com/acme/web/pull/87',
          'https://github.com/acme/web/issues/12#issuecomment-1',
          'https://jira.example.com/browse/ABC-33/?focus=1',
          'https://example.com',
          'ABC-33',
        ]}
      />,
    );

    const links = screen.getAllByRole('link');
    expect(
      links.map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['acme/web#87', 'https://github.com/acme/web/pull/87'],
      ['acme/web#12', 'https://github.com/acme/web/issues/12#issuecomment-1'],
      [
        'jira.example.com/browse/ABC-33',
        'https://jira.example.com/browse/ABC-33/?focus=1',
      ],
      ['example.com', 'https://example.com'],
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(referencesShown()).toContain('ABC-33');
    expect(screen.queryByRole('link', { name: 'ABC-33' })).toBeNull();
  });

  it('shows a value that is not an http(s) URL as plain text, never as a link', () => {
    renderWithTheme(
      <ExternalReferenceEditor
        ticketNumber={4}
        references={['javascript:alert(1)', 'mailto:someone@example.com']}
      />,
    );

    expect(screen.queryAllByRole('link')).toEqual([]);
    expect(referencesShown()).toEqual([
      'javascript:alert(1)',
      'mailto:someone@example.com',
    ]);
  });

  it('says when there are none', () => {
    renderWithTheme(
      <ExternalReferenceEditor ticketNumber={4} references={[]} />,
    );

    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('adds a reference at once, before the server confirms it', async () => {
    const user = userEvent.setup();
    const saved = deferred<{ ok: true }>();
    vi.mocked(addTicketExternalReference).mockReturnValue(saved.promise);
    renderWithTheme(
      <ExternalReferenceEditor ticketNumber={4} references={['#55']} />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Add External reference' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'URL or key' }),
      'ABC-33{Enter}',
    );

    expect(referencesShown()).toEqual(['#55', 'ABC-33']);
    expect(screen.queryByRole('textbox', { name: 'URL or key' })).toBeNull();
    expect(addTicketExternalReference).toHaveBeenCalledWith({
      number: 4,
      reference: 'ABC-33',
    });
    saved.resolve({ ok: true });
  });

  it('reopens the field with the reason and the draft when the server refuses', async () => {
    const user = userEvent.setup();
    vi.mocked(addTicketExternalReference).mockResolvedValue({
      ok: false,
      error: 'nope',
      fieldErrors: {
        externalReferences: '"ABC 33" is not a valid URL or key.',
      },
    });
    renderWithTheme(
      <ExternalReferenceEditor ticketNumber={4} references={[]} />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Add External reference' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'URL or key' }),
      'ABC 33{Enter}',
    );

    const field = await screen.findByRole('textbox', { name: 'URL or key' });
    expect(field).toHaveValue('ABC 33');
    expect(field).toHaveAccessibleDescription(
      '"ABC 33" is not a valid URL or key.',
    );
    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('removes a reference at once', async () => {
    const user = userEvent.setup();
    const saved = deferred<{ ok: true }>();
    vi.mocked(removeTicketExternalReference).mockReturnValue(saved.promise);
    renderWithTheme(
      <ExternalReferenceEditor
        ticketNumber={4}
        references={['#55', 'ABC-33']}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Remove External reference #55' }),
    );

    expect(referencesShown()).toEqual(['ABC-33']);
    expect(removeTicketExternalReference).toHaveBeenCalledWith({
      number: 4,
      reference: '#55',
    });
    saved.resolve({ ok: true });
  });

  it('shows a refused removal and brings the reference back', async () => {
    const user = userEvent.setup();
    vi.mocked(removeTicketExternalReference).mockResolvedValue({
      ok: false,
      error: 'This Project is archived.',
    });
    renderWithTheme(
      <ExternalReferenceEditor ticketNumber={4} references={['#55']} />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Remove External reference #55' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This Project is archived.',
      ),
    );
    expect(referencesShown()).toEqual(['#55']);
  });
});
