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

/** Wh of one full smartphone charge (US EPA; ADR 0050). */
export const whPerPhoneCharge = 19;

/** gCO₂e per km by an average petrol car (US EPA, rounded; ADR 0050). */
export const gramsPerCarKm = 250;

/** A Conversation's estimated Footprint, or not measured when it recorded no tokens. */
export type Footprint =
  | { measured: false }
  | {
      measured: true;
      energyWh: number;
      co2eG: number;
      phoneCharges: number;
      carKm: number;
    };

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
    phoneCharges: energyWh / whPerPhoneCharge,
    carKm: co2eG / gramsPerCarKm,
  };
}
