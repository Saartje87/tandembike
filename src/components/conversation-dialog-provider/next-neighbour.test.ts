import { describe, expect, it } from 'vitest';

import { nextNeighbour } from './next-neighbour';

describe('nextNeighbour', () => {
  it('takes the item that moved into the removed place', () => {
    expect(nextNeighbour(['a', 'c'], 1)).toBe('c');
  });

  it('takes the one before when the last was removed', () => {
    expect(nextNeighbour(['a', 'b'], 2)).toBe('b');
  });

  it('is undefined when nothing remains', () => {
    expect(nextNeighbour([], 0)).toBeUndefined();
  });
});
