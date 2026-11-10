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

const comparisons = {
  phoneCharges: 3.47,
  ledBulbHours: 7.33,
  kettles: 0.33,
  householdDays: 0.00666,
  carKm: 0.0634,
};

describe('formatComparisons (T1347)', () => {
  it('gives all five comparisons in the fixed order, each at one significant figure', () => {
    expect(formatComparisons(comparisons)).toEqual([
      '≈ 3 phone charges',
      '≈ 7 hours of an LED bulb',
      '≈ 0.3 kettles boiled',
      "≈ 0.007 days of an EU household's electricity",
      '≈ 0.06 km by petrol car',
    ]);
  });

  it('rounds large amounts to one significant figure too', () => {
    expect(
      formatComparisons({
        phoneCharges: 4321,
        ledBulbHours: 96_000,
        kettles: 455,
        householdDays: 8.6,
        carKm: 15.4,
      }),
    ).toEqual([
      '≈ 4000 phone charges',
      '≈ 100000 hours of an LED bulb',
      '≈ 500 kettles boiled',
      "≈ 9 days of an EU household's electricity",
      '≈ 20 km by petrol car',
    ]);
  });

  it('writes tiny amounts out in full, never as an exponent', () => {
    expect(
      formatComparisons({ ...comparisons, householdDays: 0.000000234 })[3],
    ).toBe("≈ 0.0000002 days of an EU household's electricity");
  });

  it('names one of a unit in the singular', () => {
    expect(
      formatComparisons({
        phoneCharges: 1.2,
        ledBulbHours: 0.96,
        kettles: 1,
        householdDays: 1.04,
        carKm: 1,
      }),
    ).toEqual([
      '≈ 1 phone charge',
      '≈ 1 hour of an LED bulb',
      '≈ 1 kettle boiled',
      "≈ 1 day of an EU household's electricity",
      '≈ 1 km by petrol car',
    ]);
  });

  it('says 0 for nothing', () => {
    expect(formatComparisons({ ...comparisons, kettles: 0 })[2]).toBe(
      '≈ 0 kettles boiled',
    );
  });
});
