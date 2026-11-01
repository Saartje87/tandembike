import { describe, expect, it } from 'vitest';

import { type CycleState, openCyclesInOrder } from './cycle-state';

const cycle = (id: number, state: CycleState) => ({ id, state });

describe('openCyclesInOrder', () => {
  it('lists the Active Cycle first, then the Prepared ones, and drops Archived ones', () => {
    expect(
      openCyclesInOrder([
        cycle(1, 'Prepared'),
        cycle(2, 'Archived'),
        cycle(3, 'Active'),
        cycle(4, 'Prepared'),
      ]),
    ).toEqual([cycle(3, 'Active'), cycle(1, 'Prepared'), cycle(4, 'Prepared')]);
  });
});
