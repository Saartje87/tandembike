import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import { FootprintText } from './footprint-text';

showOpenPopovers();

const measured = {
  measured: true as const,
  energyWh: 12.3,
  co2eG: 5.8,
  phoneCharges: 0.65,
  carKm: 0.023,
};

describe('FootprintText (T1176)', () => {
  it('shows the Footprint marked as an estimate', () => {
    renderWithTheme(<FootprintText footprint={measured} />);

    expect(screen.getByText('~12 Wh · ~5.8 g CO₂e est.')).toBeInTheDocument();
  });

  it('gives the comparisons in a tooltip on hover', async () => {
    renderWithTheme(<FootprintText footprint={measured} />);

    await userEvent.hover(screen.getByText('~12 Wh · ~5.8 g CO₂e est.'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '≈ 0.65 phone charges · ≈ 0.023 km by car',
    );
  });

  it('says not measured without recorded tokens', () => {
    renderWithTheme(<FootprintText footprint={{ measured: false }} />);

    expect(screen.getByText('Footprint not measured')).toBeInTheDocument();
  });
});
