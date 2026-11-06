import { describe, expect, it } from 'vitest';

import { formatElapsed } from './format-elapsed';

describe('formatElapsed', () => {
  it.each([
    [0, '0s'],
    [45_000, '45s'],
    [59_999, '59s'],
    [60_000, '1m'],
    [3 * 60_000 + 40_000, '3m'],
    [59 * 60_000, '59m'],
    [60 * 60_000, '1h'],
    [72 * 60_000, '1h 12m'],
    [23 * 3_600_000 + 59 * 60_000, '23h 59m'],
    [24 * 3_600_000, '1d'],
    [2 * 86_400_000 + 5 * 3_600_000, '2d'],
    [-5_000, '0s'],
  ])('formats %d ms as %s', (ms, text) => {
    expect(formatElapsed(ms)).toBe(text);
  });
});
