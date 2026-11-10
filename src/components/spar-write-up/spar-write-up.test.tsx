import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateSparWriteUp } from '../../app/spars/actions';
import { renderWithTheme } from '../../test/render';
import { SparWriteUp } from './spar-write-up';

vi.mock('../../app/spars/actions', () => ({ updateSparWriteUp: vi.fn() }));

const writeUp = {
  decisions: '- Use a **cache**',
  openQuestions: '',
  nextSteps: '',
};

describe('SparWriteUp', () => {
  beforeEach(() => {
    vi.mocked(updateSparWriteUp).mockReset();
  });

  it('shows Decisions, Open questions and Next steps, empty ones with a hint', () => {
    renderWithTheme(<SparWriteUp sparId={5} writeUp={writeUp} />);

    expect(
      screen.getByRole('heading', { name: 'Decisions' }),
    ).toBeInTheDocument();
    expect(screen.getByText('cache')).toBeInTheDocument();
    expect(screen.getByText('No open questions yet')).toBeInTheDocument();
    expect(screen.getByText('No next steps yet')).toBeInTheDocument();
  });

  it('saves the section the User edits, showing it at once', async () => {
    // Held pending, as the page's refresh brings the saved text afterwards.
    let settle: (value: { ok: true; writeUp: typeof writeUp }) => void =
      () => {};
    vi.mocked(updateSparWriteUp).mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    renderWithTheme(<SparWriteUp sparId={5} writeUp={writeUp} />);

    await userEvent.click(screen.getByText('No next steps yet'));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Next steps' }),
      'Try it{Control>}{Enter}{/Control}',
    );

    expect(updateSparWriteUp).toHaveBeenCalledWith({
      sparId: 5,
      writeUp: { nextSteps: 'Try it' },
    });
    expect(await screen.findByText('Try it')).toBeInTheDocument();
    settle({ ok: true, writeUp: { ...writeUp, nextSteps: 'Try it' } });
  });

  it('reopens the section with the reason when the edit is refused', async () => {
    vi.mocked(updateSparWriteUp).mockResolvedValue({
      ok: false,
      error: 'This Spar is closed. Reopen it to change it.',
    });
    renderWithTheme(<SparWriteUp sparId={5} writeUp={writeUp} />);

    await userEvent.click(screen.getByText('No next steps yet'));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Next steps' }),
      'Try it{Control>}{Enter}{/Control}',
    );

    expect(
      await screen.findByText('This Spar is closed. Reopen it to change it.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Next steps' })).toHaveValue(
        'Try it',
      ),
    );
  });

  it('is read-only on a closed Spar', async () => {
    renderWithTheme(<SparWriteUp sparId={5} writeUp={writeUp} readOnly />);

    await userEvent.click(screen.getByText('cache'));

    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
