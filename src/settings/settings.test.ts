// @vitest-environment node

import { describe, expect, it } from 'vitest';

import { defaultFootprintFactors } from '../footprint/footprint';
import { createTestSettings } from '../test/settings';
import { errorFrom } from '../test/tickets';
import { ValidationError } from '../tickets/errors';

describe('The Footprint factors (T1178)', () => {
  it('are the ADR 0050 defaults until saved', () => {
    const settings = createTestSettings();

    expect(settings.getFootprintFactors()).toEqual(defaultFootprintFactors);
  });

  it('saves the factors given and keeps the others', () => {
    const settings = createTestSettings();

    const saved = settings.setFootprintFactors({
      sonnetWhPerMillion: 320,
      gridGramsPerKwh: 0,
    });

    const expected = {
      ...defaultFootprintFactors,
      sonnetWhPerMillion: 320,
      gridGramsPerKwh: 0,
    };
    expect(saved).toEqual(expected);
    expect(settings.getFootprintFactors()).toEqual(expected);
  });

  it('refuses a factor that is negative or not a finite number, naming the field, and saves nothing', () => {
    const settings = createTestSettings();

    expect(
      errorFrom(() =>
        settings.setFootprintFactors({
          haikuWhPerMillion: -1,
          opusWhPerMillion: Number.NaN,
          gridGramsPerKwh: Number.POSITIVE_INFINITY,
          sonnetWhPerMillion: 10,
        }),
      ),
    ).toEqual(
      new ValidationError({
        haikuWhPerMillion: 'Enter a number of 0 or more.',
        opusWhPerMillion: 'Enter a number of 0 or more.',
        gridGramsPerKwh: 'Enter a number of 0 or more.',
      }),
    );
    expect(settings.getFootprintFactors()).toEqual(defaultFootprintFactors);
  });

  it('resets a factor to its default and keeps the others', () => {
    const settings = createTestSettings();
    settings.setFootprintFactors({ haikuWhPerMillion: 1, opusWhPerMillion: 2 });

    expect(settings.resetFootprintFactor('haikuWhPerMillion')).toEqual({
      ...defaultFootprintFactors,
      opusWhPerMillion: 2,
    });
  });

  it('refuses to reset a factor it does not know', () => {
    const settings = createTestSettings();

    expect(
      errorFrom(() => settings.resetFootprintFactor('nope' as never)),
    ).toEqual(
      new ValidationError({ name: 'There is no Footprint factor "nope".' }),
    );
  });
});
