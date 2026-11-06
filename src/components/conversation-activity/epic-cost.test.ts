import { describe, expect, it } from 'vitest';

import { epicCost } from './epic-cost';

describe('epicCost', () => {
  const epic = { number: 1, children: [{ number: 2 }, { number: 3 }] };

  it("adds the Epic's own Conversations to its children's", () => {
    expect(epicCost(epic, { 1: 0.5, 2: 1, 3: 0.25, 9: 7 })).toBeCloseTo(1.75);
  });

  it('counts what is missing as nothing', () => {
    expect(epicCost(epic, {})).toBe(0);
    expect(epicCost(epic, { 3: 2 })).toBe(2);
  });
});
