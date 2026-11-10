import type { TokenUsage, UsageByModel } from './token-usage';

/** The tiers a model id is matched to by name (ADR 0050). */
export type ModelTier = 'haiku' | 'sonnet' | 'opus';

/**
 * The app-wide Footprint factors (ADR 0050): Wh per 1M output tokens for each
 * tier, data-centre PUE included, and the grid's gCO₂e per kWh.
 */
export type FootprintFactors = {
  haikuWhPerMillion: number;
  sonnetWhPerMillion: number;
  opusWhPerMillion: number;
  gridGramsPerKwh: number;
};

/** The defaults, from `docs/research/footprint-factors.md` (ADR 0050). */
export const defaultFootprintFactors: FootprintFactors = {
  haikuWhPerMillion: 150,
  sonnetWhPerMillion: 500,
  opusWhPerMillion: 1000,
  gridGramsPerKwh: 475,
};

/** What each token type weighs, as a fraction of an output token (ADR 0050). */
export const tokenWeights: TokenUsage = {
  output: 1,
  input: 0.2,
  cacheWrite: 0.2,
  cacheRead: 0.02,
};

/** Wh of one full smartphone charge (US EPA; research §5, ADR 0050). */
export const whPerPhoneCharge = 19;

/**
 * W drawn by an LED bulb that replaces a 60 W incandescent: the EU power cap
 * for 806 lm, rounded (Regulations 244/2009 and 2019/2020; research §6).
 */
export const ledBulbWatts = 9;

/**
 * Wh to boil a full 1.7 L kettle from 15 °C, at 85% efficiency (NIST heat
 * capacity of water; research §6).
 */
export const whPerKettle = 200;

/**
 * Wh of one day of an average EU household's electricity: 3.6 MWh per
 * dwelling per year (Odyssee-Mure; research §6).
 */
export const whPerHouseholdDay = 9900;

/** gCO₂e per km by an average petrol car (US EPA, rounded; research §5, ADR 0050). */
export const gramsPerCarKm = 250;

/**
 * The everyday things a Footprint equals (ADR 0050): the first four from its
 * energy, km by car from its CO₂e.
 */
export type Comparisons = {
  phoneCharges: number;
  ledBulbHours: number;
  kettles: number;
  householdDays: number;
  carKm: number;
};

/** A measured Footprint: energy, CO₂e and what they equal. */
export type MeasuredFootprint = {
  measured: true;
  energyWh: number;
  co2eG: number;
  comparisons: Comparisons;
};

/** A Conversation's estimated Footprint, or not measured when it recorded no tokens. */
export type Footprint = { measured: false } | MeasuredFootprint;

/** The comparisons of `energyWh` and `co2eG`. */
export function comparisonsOf(energyWh: number, co2eG: number): Comparisons {
  return {
    phoneCharges: energyWh / whPerPhoneCharge,
    ledBulbHours: energyWh / ledBulbWatts,
    kettles: energyWh / whPerKettle,
    householdDays: energyWh / whPerHouseholdDay,
    carKm: co2eG / gramsPerCarKm,
  };
}

/** The tier of `model` by name; a model matching none counts as Opus. */
export function tierOf(model: string): ModelTier {
  const name = model.toLowerCase();
  if (name.includes('haiku')) {
    return 'haiku';
  }
  if (name.includes('sonnet')) {
    return 'sonnet';
  }
  return 'opus';
}

const whPerMillionOf = (tier: ModelTier, factors: FootprintFactors) =>
  ({
    haiku: factors.haikuWhPerMillion,
    sonnet: factors.sonnetWhPerMillion,
    opus: factors.opusWhPerMillion,
  })[tier];

/** `tokens` weighed as output tokens. */
const weighted = (tokens: TokenUsage) =>
  tokens.output * tokenWeights.output +
  tokens.input * tokenWeights.input +
  tokens.cacheWrite * tokenWeights.cacheWrite +
  tokens.cacheRead * tokenWeights.cacheRead;

/** The Footprint of `usage` with `factors`; not measured when `usage` is empty. */
export function footprintOf(
  usage: UsageByModel,
  factors: FootprintFactors,
): Footprint {
  const models = Object.entries(usage);
  if (models.length === 0) {
    return { measured: false };
  }
  const energyWh = models.reduce(
    (sum, [model, tokens]) =>
      sum +
      (weighted(tokens) / 1_000_000) * whPerMillionOf(tierOf(model), factors),
    0,
  );
  const co2eG = (energyWh / 1000) * factors.gridGramsPerKwh;
  return {
    measured: true,
    energyWh,
    co2eG,
    comparisons: comparisonsOf(energyWh, co2eG),
  };
}
