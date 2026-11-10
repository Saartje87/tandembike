import { describe, expect, it } from 'vitest';

import {
  formatComparisons,
  formatFootprint,
  formatMeasure,
} from './format-footprint';

describe('formatMeasure (T1176)', () => {
  it('rounds to two significant digits and whole numbers from 100', () => {
    expect(formatMeasure(12.34)).toBe('12');
    expect(formatMeasure(3.456)).toBe('3.5');
    expect(formatMeasure(0.0123)).toBe('0.012');
    expect(formatMeasure(456.7)).toBe('457');
    expect(formatMeasure(0)).toBe('0');
  });

  it('says less than 0.01 for a tiny amount', () => {
    expect(formatMeasure(0.0004)).toBe('<0.01');
  });
});

describe('formatFootprint (T1176)', () => {
  it('shows energy and CO₂e marked as an estimate', () => {
    expect(formatFootprint({ energyWh: 12.3, co2eG: 4.1 })).toBe(
      '~12 Wh · ~4.1 g CO₂e est.',
    );
  });

  it('scales the units of large amounts', () => {
    expect(formatFootprint({ energyWh: 2500, co2eG: 1250 })).toBe(
      '~2.5 kWh · ~1.3 kg CO₂e est.',
    );
    expect(formatFootprint({ energyWh: 3_400_000, co2eG: 2_000_000 })).toBe(
      '~3.4 MWh · ~2 t CO₂e est.',
    );
  });
});

describe('formatComparisons (T1176)', () => {
  it('gives phone charges and km by car', () => {
    expect(formatComparisons({ phoneCharges: 2.04, carKm: 0.123 })).toBe(
      '≈ 2 phone charges · ≈ 0.12 km by car',
    );
  });
});
