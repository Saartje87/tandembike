/** A cost in US dollars; under a cent, to 4 places. */
export const formatCost = (costUsd: number) =>
  `$${costUsd > 0 && costUsd < 0.01 ? costUsd.toFixed(4) : costUsd.toFixed(2)}`;
