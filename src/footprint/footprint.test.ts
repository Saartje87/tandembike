import { describe, expect, it } from 'vitest';

import {
  defaultFootprintFactors,
  type FootprintFactors,
  footprintOf,
  tierOf,
} from './footprint';
import { noTokens } from './token-usage';

const factors: FootprintFactors = {
  haikuWhPerMillion: 100,
  sonnetWhPerMillion: 400,
  opusWhPerMillion: 1000,
  gridGramsPerKwh: 500,
};

const output = (n: number) => ({ ...noTokens, output: n });

describe('tierOf (T1176)', () => {
  it('matches the tier by name in the model id, ignoring case', () => {
    expect(tierOf('claude-haiku-5-5')).toBe('haiku');
    expect(tierOf('claude-sonnet-5-5[1m]')).toBe('sonnet');
    expect(tierOf('Claude-Opus-5-5')).toBe('opus');
  });

  it('counts a model it does not know as Opus', () => {
    expect(tierOf('claude-fable-5-1')).toBe('opus');
  });
});

describe('footprintOf (T1176)', () => {
  it('is not measured without usage', () => {
    expect(footprintOf({}, factors)).toEqual({ measured: false });
  });

  it('gives energy from output tokens and the tier factor, and CO₂e from the grid', () => {
    expect(
      footprintOf({ 'claude-opus-5-5': output(2_000_000) }, factors),
    ).toMatchObject({ measured: true, energyWh: 2000, co2eG: 1000 });
  });

  it('weighs input, cache-write and cache-read tokens as fractions of an output token', () => {
    const footprint = footprintOf(
      {
        'claude-sonnet-5-5': {
          input: 1_000_000,
          output: 0,
          cacheWrite: 1_000_000,
          cacheRead: 1_000_000,
        },
      },
      factors,
    );

    // (0.2 + 0.2 + 0.02) × 400 Wh
    expect(footprint).toMatchObject({ energyWh: expect.closeTo(168, 6) });
  });

  it('counts each model with its own tier', () => {
    const footprint = footprintOf(
      {
        'claude-haiku-5-5': output(1_000_000),
        'claude-mystery-1': output(1_000_000),
      },
      factors,
    );

    expect(footprint).toMatchObject({ energyWh: 1100 });
  });

  it('gives the phone charges and km by car it equals', () => {
    const footprint = footprintOf(
      { 'claude-opus-5-5': output(1_900) },
      factors,
    );

    // 1.9 Wh is 0.1 phone charges of 19 Wh; 0.95 g is 0.0038 km at 250 g/km.
    expect(footprint).toMatchObject({
      phoneCharges: expect.closeTo(0.1, 6),
      carKm: expect.closeTo(0.0038, 6),
    });
  });

  it('is measured at zero when a run reported no tokens', () => {
    expect(footprintOf({ 'claude-opus-5-5': noTokens }, factors)).toMatchObject(
      { measured: true, energyWh: 0 },
    );
  });
});

describe('defaultFootprintFactors (T1176)', () => {
  it('are the ADR 0050 defaults', () => {
    expect(defaultFootprintFactors).toEqual({
      haikuWhPerMillion: 150,
      sonnetWhPerMillion: 500,
      opusWhPerMillion: 1000,
      gridGramsPerKwh: 475,
    });
  });
});
