/** The states a Cycle moves through, in order (ADR 0010). */
export const cycleStates = ['Prepared', 'Active', 'Archived'] as const;

export type CycleState = (typeof cycleStates)[number];
