// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { showOpenPopovers } from '../../test/popover';
import { renderWithTheme } from '../../test/render';
import { FootprintText } from './footprint-text';
import * as styles from './footprint-text.css';

showOpenPopovers();

// Written out rather than `aFootprint`, so the comparisons pin the exact
// one-significant-figure strings below.
const measured = {
  measured: true as const,
  energyWh: 12.3,
  co2eG: 5.8,
  comparisons: {
    phoneCharges: 0.62,
    ledBulbHours: 1.37,
    kettles: 0.0615,
    householdDays: 0.00124,
    carKm: 0.023,
  },
};

const comparisonLines = [
  '≈ 0.6 phone charges',
  '≈ 1 hour of an LED bulb',
  '≈ 0.06 kettles boiled',
  "≈ 0.001 days of an EU household's electricity",
  '≈ 0.02 km by petrol car',
];

describe('FootprintText (T1176)', () => {
  it('shows the Footprint marked as an estimate', () => {
    renderWithTheme(<FootprintText footprint={measured} />);

    expect(screen.getByText('~12 Wh · ~5.8 g CO₂e est.')).toBeInTheDocument();
  });

  it('says not measured without recorded tokens', () => {
    renderWithTheme(<FootprintText footprint={{ measured: false }} />);

    expect(screen.getByText('Footprint not measured')).toBeInTheDocument();
  });
});

describe('FootprintText comparisons (T1347)', () => {
  it('marks the Footprint with a dotted-underline hint', () => {
    renderWithTheme(<FootprintText footprint={measured} />);

    expect(screen.getByText('~12 Wh · ~5.8 g CO₂e est.')).toHaveClass(
      styles.hint,
    );
  });

  it('lists the five comparisons in order in a tooltip on hover', async () => {
    renderWithTheme(<FootprintText footprint={measured} />);

    await userEvent.hover(screen.getByText('~12 Wh · ~5.8 g CO₂e est.'));

    const tooltip = await screen.findByRole('tooltip');
    expect(
      [...tooltip.querySelectorAll('[data-comparison]')].map(
        (line) => line.textContent,
      ),
    ).toEqual(comparisonLines);
  });

  it('opens the tooltip on keyboard focus', async () => {
    renderWithTheme(<FootprintText footprint={measured} />);

    await userEvent.tab();

    expect(screen.getByText('~12 Wh · ~5.8 g CO₂e est.')).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '≈ 0.6 phone charges',
    );
  });

  it('puts an optional label before the Footprint, outside the hint', () => {
    renderWithTheme(<FootprintText footprint={measured} label="Cycle:" />);

    expect(
      screen.getByText('~12 Wh · ~5.8 g CO₂e est.').parentElement,
    ).toHaveTextContent('Cycle: ~12 Wh · ~5.8 g CO₂e est.');
  });

  it('opens the tooltip with an optional scope line', async () => {
    renderWithTheme(
      <FootprintText
        footprint={measured}
        scope="All Conversations on this Cycle, hand-started included"
      />,
    );

    await userEvent.hover(screen.getByText('~12 Wh · ~5.8 g CO₂e est.'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /^All Conversations on this Cycle, hand-started included≈ 0\.6 phone charges/,
    );
  });

  it('shows no hint and no tooltip when not measured', async () => {
    renderWithTheme(
      <FootprintText footprint={{ measured: false }} label="Cycle:" />,
    );

    const text = screen.getByText('Cycle: Footprint not measured');
    expect(text).not.toHaveClass(styles.hint);
    expect(text).not.toHaveAttribute('tabindex');
    await userEvent.hover(text);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
