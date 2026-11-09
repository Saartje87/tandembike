import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { saveMachineSettings } from '../../app/settings/actions';
import { renderWithTheme } from '../../test/render';
import { MachineSettingsForm } from './machine-settings-form';

vi.mock('../../app/settings/actions', () => ({ saveMachineSettings: vi.fn() }));

beforeEach(() => {
  vi.mocked(saveMachineSettings).mockReset();
});

describe('MachineSettingsForm', () => {
  it('shows the saved cap', () => {
    renderWithTheme(
      <MachineSettingsForm settings={{ maxConcurrentRuns: 3 }} />,
    );

    expect(screen.getByLabelText('Max concurrent runs')).toHaveValue(3);
  });

  it('saves the cap the User types', async () => {
    vi.mocked(saveMachineSettings).mockResolvedValue({
      ok: true,
      settings: { maxConcurrentRuns: 5 },
    });
    renderWithTheme(
      <MachineSettingsForm settings={{ maxConcurrentRuns: 3 }} />,
    );
    const field = screen.getByLabelText('Max concurrent runs');

    await userEvent.clear(field);
    await userEvent.type(field, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(saveMachineSettings).toHaveBeenCalledWith({
        maxConcurrentRuns: 5,
      }),
    );
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('shows a refusal under the field and keeps the draft', async () => {
    vi.mocked(saveMachineSettings).mockResolvedValue({
      ok: false,
      error: 'Invalid',
      fieldErrors: { maxConcurrentRuns: 'Enter a whole number of at least 1.' },
    });
    renderWithTheme(
      <MachineSettingsForm settings={{ maxConcurrentRuns: 3 }} />,
    );
    const field = screen.getByLabelText('Max concurrent runs');

    await userEvent.clear(field);
    await userEvent.type(field, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Enter a whole number of at least 1.'),
    ).toBeInTheDocument();
    expect(field).toHaveValue(2);
  });
});
