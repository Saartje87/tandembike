import { describe, expect, it } from 'vitest';

import { cycleUnitCount, type PlannedTicket } from './cycle-units';

const ticket = (
  number: number,
  extra: Partial<PlannedTicket> = {},
): PlannedTicket => ({
  number,
  type: 'Ticket',
  status: 'Todo',
  archived: false,
  epic: null,
  ...extra,
});
const epic = (number: number): PlannedTicket =>
  ticket(number, { type: 'Epic' });
const child = (number: number, epicNumber: number, extra = {}) =>
  ticket(number, { epic: { number: epicNumber }, ...extra });

describe('cycleUnitCount', () => {
  it('counts each Ticket as one', () => {
    expect(cycleUnitCount([ticket(1), ticket(2)])).toBe(2);
  });

  it('counts an Epic as its unarchived, not-Done children planned there', () => {
    const planned = [
      epic(10),
      child(11, 10),
      child(12, 10),
      child(13, 10, { status: 'Done' }),
      child(14, 10, { archived: true }),
      ticket(1),
    ];
    expect(cycleUnitCount(planned)).toBe(3);
  });

  it('counts an Epic with no such children as one', () => {
    expect(cycleUnitCount([epic(10)])).toBe(1);
    expect(cycleUnitCount([epic(10), child(11, 10, { status: 'Done' })])).toBe(
      1,
    );
  });

  it('counts a child whose Epic is planned elsewhere as a Ticket', () => {
    expect(cycleUnitCount([child(11, 10), child(12, 10)])).toBe(2);
  });

  it('is zero for an empty Cycle', () => {
    expect(cycleUnitCount([])).toBe(0);
  });
});
