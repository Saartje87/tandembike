import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

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
      <MachineSettingsForm
        settings={{ maxConcurrentRuns: 3, dailySpendCeilingUsd: null }}
      />,
    );

    expect(screen.getByLabelText('Max concurrent runs')).toHaveValue(3);
  });

  it('saves the cap the User types', async () => {
    vi.mocked(saveMachineSettings).mockResolvedValue({
      ok: true,
      settings: { maxConcurrentRuns: 5, dailySpendCeilingUsd: null },
    });
    renderWithTheme(
      <MachineSettingsForm
        settings={{ maxConcurrentRuns: 3, dailySpendCeilingUsd: null }}
      />,
    );
    const field = screen.getByLabelText('Max concurrent runs');

    await userEvent.clear(field);
    await userEvent.type(field, '5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(saveMachineSettings).toHaveBeenCalledWith({
        maxConcurrentRuns: 5,
        dailySpendCeilingUsd: null,
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
      <MachineSettingsForm
        settings={{ maxConcurrentRuns: 3, dailySpendCeilingUsd: null }}
      />,
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

  it('shows and saves the daily spend ceiling, and clears it when emptied', async () => {
    vi.mocked(saveMachineSettings).mockResolvedValue({
      ok: true,
      settings: { maxConcurrentRuns: 3, dailySpendCeilingUsd: 20 },
    });
    renderWithTheme(
      <MachineSettingsForm
        settings={{ maxConcurrentRuns: 3, dailySpendCeilingUsd: 12.5 }}
      />,
    );
    const field = screen.getByLabelText('Daily spend ceiling (USD)');
    expect(field).toHaveValue(12.5);

    await userEvent.clear(field);
    await userEvent.type(field, '20');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(saveMachineSettings).toHaveBeenLastCalledWith({
        maxConcurrentRuns: 3,
        dailySpendCeilingUsd: 20,
      }),
    );

    await userEvent.clear(field);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(saveMachineSettings).toHaveBeenLastCalledWith({
        maxConcurrentRuns: 3,
        dailySpendCeilingUsd: null,
      }),
    );
  });

  it('shows a ceiling refusal under its field', async () => {
    vi.mocked(saveMachineSettings).mockResolvedValue({
      ok: false,
      error: 'Invalid',
      fieldErrors: {
        dailySpendCeilingUsd: 'Enter an amount in dollars above 0.',
      },
    });
    renderWithTheme(
      <MachineSettingsForm
        settings={{ maxConcurrentRuns: 3, dailySpendCeilingUsd: null }}
      />,
    );

    await userEvent.type(
      screen.getByLabelText('Daily spend ceiling (USD)'),
      '0',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Enter an amount in dollars above 0.'),
    ).toBeInTheDocument();
  });
  it('shows a save whose action throws as an alert and keeps the draft (T1322)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onTestFinished(() => log.mockRestore());
    vi.mocked(saveMachineSettings).mockRejectedValue(new Error('network down'));
    renderWithTheme(
      <MachineSettingsForm
        settings={{ maxConcurrentRuns: 3, dailySpendCeilingUsd: null }}
      />,
    );
    const field = screen.getByLabelText('Max concurrent runs');

    await userEvent.clear(field);
    await userEvent.type(field, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The machine settings could not be saved. Try again.',
    );
    expect(field).toHaveValue(2);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
