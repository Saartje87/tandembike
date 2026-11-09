import { Inline, Text } from '@blockle/blocks';
import type { FC } from 'react';

export type TriageSpendProps = {
  /** What Auto-triage spent today, in USD. */
  spendUsd: number;
  /** The Project's Triage ceiling per day, in USD. */
  ceilingUsd: number;
};

/**
 * The Backlog Board's header while Auto-triage is on: today's triage spend
 * against the Triage ceiling, and a note while triage is paused over it.
 */
export const TriageSpend: FC<TriageSpendProps> = ({ spendUsd, ceilingUsd }) => (
  <Inline gap={2} alignY="center">
    <Text fontSize="small" color="muted">
      {`Triage today: $${spendUsd.toFixed(2)} of $${ceilingUsd.toFixed(2)}`}
    </Text>
    {spendUsd >= ceilingUsd && (
      <Text fontSize="small" color="muted" fontWeight="bold">
        triage paused: over ceiling
      </Text>
    )}
  </Inline>
);
