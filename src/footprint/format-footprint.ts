import type { Comparisons } from './footprint';

/**
 * An amount to two significant digits, whole from 100 up, and "<0.01" when
 * it is below that: a Footprint is a rough estimate (ADR 0050).
 */
export function formatMeasure(amount: number): string {
  if (amount === 0) {
    return '0';
  }
  if (amount < 0.01) {
    return '<0.01';
  }
  if (amount >= 100) {
    return String(Math.round(amount));
  }
  return String(Number(amount.toPrecision(2)));
}

/** `amount` of the base unit in the largest of `units` it reaches, each 1000 times the last. */
function scaled(amount: number, units: string[]): string {
  let index = 0;
  let value = amount;
  while (value >= 1000 && index < units.length - 1) {
    value /= 1000;
    index += 1;
  }
  return `~${formatMeasure(value)} ${units[index]}`;
}

/** A Footprint as "~12 Wh · ~4 g CO₂e est.", its units scaling. */
export function formatFootprint(footprint: {
  energyWh: number;
  co2eG: number;
}): string {
  return `${scaled(footprint.energyWh, ['Wh', 'kWh', 'MWh'])} · ${scaled(footprint.co2eG, ['g', 'kg', 't'])} CO₂e est.`;
}

/**
 * `amount` at one significant figure, written out in full: a comparison is
 * no more precise than the estimate behind it (ADR 0050).
 */
function oneSignificantFigure(amount: number): string {
  if (amount === 0) {
    return '0';
  }
  const rounded = Number(amount.toPrecision(1));
  const decimals = Math.max(0, -Math.floor(Math.log10(rounded)));
  return rounded.toFixed(decimals);
}

/** Each comparison's unit, singular and plural, in the fixed order (ADR 0050). */
const comparisonUnits: [keyof Comparisons, string, string][] = [
  ['phoneCharges', 'phone charge', 'phone charges'],
  ['ledBulbHours', 'hour of an LED bulb', 'hours of an LED bulb'],
  ['kettles', 'kettle boiled', 'kettles boiled'],
  [
    'householdDays',
    "day of an EU household's electricity",
    "days of an EU household's electricity",
  ],
  ['carKm', 'km by petrol car', 'km by petrol car'],
];

/**
 * A Footprint's five everyday comparisons, always all five in the same
 * order, each "≈ N <unit>" at one significant figure (ADR 0050).
 */
export function formatComparisons(comparisons: Comparisons): string[] {
  return comparisonUnits.map(([key, one, many]) => {
    const amount = oneSignificantFigure(comparisons[key]);
    return `≈ ${amount} ${amount === '1' ? one : many}`;
  });
}
