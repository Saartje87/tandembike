/** The states a Cycle moves through, in order (ADR 0010). */
export const cycleStates = ['Prepared', 'Active', 'Archived'] as const;

export type CycleState = (typeof cycleStates)[number];

/**
 * The Cycles that are not Archived, in the order the UI lists them: the Active
 * one, then each Prepared one, each group in the order given.
 */
export function openCyclesInOrder<C extends { state: CycleState }>(
  cycles: readonly C[],
): C[] {
  return [
    ...cycles.filter(({ state }) => state === 'Active'),
    ...cycles.filter(({ state }) => state === 'Prepared'),
  ];
}
