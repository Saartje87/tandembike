import { describe, expect, it } from 'vitest';

import {
  defaultFootprintFactors,
  type FootprintFactors,
  footprintOf,
  notMeasuredModel,
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

  it('gives the five everyday comparisons it equals, from energy and CO₂e (T1347)', () => {
    const footprint = footprintOf(
      { 'claude-opus-5-5': output(19_800) },
      factors,
    );

    // 19.8 Wh and 9.9 g CO₂e: 19 Wh per phone charge, 9 W LED bulb,
    // 200 Wh per kettle, 9,900 Wh per EU household-day, 250 g per km.
    expect(footprint).toMatchObject({
      comparisons: {
        phoneCharges: expect.closeTo(19.8 / 19, 6),
        ledBulbHours: expect.closeTo(2.2, 6),
        kettles: expect.closeTo(0.099, 6),
        householdDays: expect.closeTo(0.002, 6),
        carKm: expect.closeTo(0.0396, 6),
      },
    });
  });

  it('moves only km by car with the grid intensity (T1347)', () => {
    const usage = { 'claude-opus-5-5': output(19_800) };
    const clean = footprintOf(usage, { ...factors, gridGramsPerKwh: 100 });
    const dirty = footprintOf(usage, { ...factors, gridGramsPerKwh: 1000 });

    if (!clean.measured || !dirty.measured) {
      throw new Error('expected measured Footprints');
    }
    expect(dirty.comparisons.carKm).toBeCloseTo(clean.comparisons.carKm * 10);
    expect(dirty.comparisons.kettles).toBe(clean.comparisons.kettles);
    expect(dirty.comparisons.phoneCharges).toBe(clean.comparisons.phoneCharges);
  });

  it('is measured at zero when a run reported no tokens', () => {
    expect(footprintOf({ 'claude-opus-5-5': noTokens }, factors)).toMatchObject(
      { measured: true, energyWh: 0 },
    );
  });
});

describe('footprintOf a model with no tier (ADR 0051, T1367)', () => {
  it('leaves its tokens out, never counting them as Opus', () => {
    const footprint = footprintOf(
      {
        'claude-sonnet-5.5': output(1_000_000),
        [notMeasuredModel('gpt-5.5')]: output(9_000_000),
      },
      factors,
    );

    expect(footprint).toMatchObject({ measured: true, energyWh: 400 });
  });

  it('is not measured when it is all a run used', () => {
    expect(
      footprintOf({ [notMeasuredModel('gpt-5.5')]: output(1) }, factors),
    ).toEqual({ measured: false });
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
