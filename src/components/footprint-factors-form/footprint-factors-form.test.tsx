// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetFootprintFactor,
  saveFootprintFactors,
} from '../../app/settings/actions';
import { defaultFootprintFactors } from '../../footprint/footprint';
import { renderWithTheme } from '../../test/render';
import { FootprintFactorsForm } from './footprint-factors-form';

vi.mock('../../app/settings/actions', () => ({
  saveFootprintFactors: vi.fn(),
  resetFootprintFactor: vi.fn(),
}));

const saved = { ...defaultFootprintFactors, opusWhPerMillion: 800 };

beforeEach(() => {
  vi.mocked(saveFootprintFactors).mockReset();
  vi.mocked(resetFootprintFactor).mockReset();
});

describe('FootprintFactorsForm (T1178)', () => {
  it('shows the saved factors', () => {
    renderWithTheme(<FootprintFactorsForm factors={saved} />);

    expect(screen.getByLabelText('Haiku, Wh per 1M output tokens')).toHaveValue(
      150,
    );
    expect(screen.getByLabelText('Opus, Wh per 1M output tokens')).toHaveValue(
      800,
    );
    expect(screen.getByLabelText('Grid intensity, gCO₂e per kWh')).toHaveValue(
      475,
    );
  });

  it('saves the factors the User types', async () => {
    vi.mocked(saveFootprintFactors).mockResolvedValue({
      ok: true,
      factors: { ...saved, sonnetWhPerMillion: 320 },
    });
    renderWithTheme(<FootprintFactorsForm factors={saved} />);
    const field = screen.getByLabelText('Sonnet, Wh per 1M output tokens');

    await userEvent.clear(field);
    await userEvent.type(field, '320');
    await userEvent.click(
      screen.getByRole('button', { name: 'Save Footprint factors' }),
    );

    await waitFor(() =>
      expect(saveFootprintFactors).toHaveBeenCalledWith({
        ...saved,
        sonnetWhPerMillion: 320,
      }),
    );
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('shows a refusal under the field it names and keeps the draft', async () => {
    vi.mocked(saveFootprintFactors).mockResolvedValue({
      ok: false,
      error: 'Enter a number of 0 or more.',
      fieldErrors: { gridGramsPerKwh: 'Enter a number of 0 or more.' },
    });
    renderWithTheme(<FootprintFactorsForm factors={saved} />);
    const field = screen.getByLabelText('Grid intensity, gCO₂e per kWh');

    await userEvent.clear(field);
    await userEvent.type(field, '-5');
    await userEvent.click(
      screen.getByRole('button', { name: 'Save Footprint factors' }),
    );

    expect(
      await screen.findByText('Enter a number of 0 or more.'),
    ).toBeInTheDocument();
    expect(field).toHaveAccessibleDescription('Enter a number of 0 or more.');
    expect(field).toHaveValue(-5);
  });

  it('resets a factor to its default', async () => {
    vi.mocked(resetFootprintFactor).mockResolvedValue({
      ok: true,
      factors: defaultFootprintFactors,
    });
    renderWithTheme(<FootprintFactorsForm factors={saved} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Reset Opus to 1000' }),
    );

    expect(resetFootprintFactor).toHaveBeenCalledWith({
      name: 'opusWhPerMillion',
    });
    await waitFor(() =>
      expect(
        screen.getByLabelText('Opus, Wh per 1M output tokens'),
      ).toHaveValue(1000),
    );
  });

  it('no longer says Saved. after a reset, which saves one factor', async () => {
    vi.mocked(saveFootprintFactors).mockResolvedValue({
      ok: true,
      factors: saved,
    });
    vi.mocked(resetFootprintFactor).mockResolvedValue({
      ok: true,
      factors: defaultFootprintFactors,
    });
    renderWithTheme(<FootprintFactorsForm factors={saved} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Save Footprint factors' }),
    );
    expect(await screen.findByText('Saved.')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Reset Opus to 1000' }),
    );

    await waitFor(() =>
      expect(screen.queryByText('Saved.')).not.toBeInTheDocument(),
    );
  });

  it('shows a refused reset under its field', async () => {
    vi.mocked(resetFootprintFactor).mockResolvedValue({
      ok: false,
      error: 'The database is busy.',
    });
    renderWithTheme(<FootprintFactorsForm factors={saved} />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Reset Haiku to 150' }),
    );

    expect(
      screen.getByLabelText('Haiku, Wh per 1M output tokens'),
    ).toHaveAccessibleDescription('The database is busy.');
  });

  it('points to the method', () => {
    renderWithTheme(<FootprintFactorsForm factors={saved} />);

    expect(screen.getByText(/ADR 0050/)).toBeInTheDocument();
  });
});
