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

/** A Footprint's everyday comparisons: "≈ 2 phone charges · ≈ 0.1 km by car". */
export function formatComparisons(footprint: {
  phoneCharges: number;
  carKm: number;
}): string {
  return `≈ ${formatMeasure(footprint.phoneCharges)} phone charges · ≈ ${formatMeasure(footprint.carKm)} km by car`;
}
