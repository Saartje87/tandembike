import { Inline, Text } from '@blockle/blocks';
import type { FC } from 'react';

import { formatCost } from '../conversation-labels/conversation-labels';

export type TriageSpendProps = {
  /** What Auto-triage spent today, in USD. */
  spendUsd: number;
  /** The Project's Triage ceiling per day, in USD. */
  ceilingUsd: number;
  /** Whether the spend has reached the ceiling, as Autopilot decides it. */
  paused: boolean;
};

/**
 * The Backlog Board's header while Auto-triage is on: today's triage spend
 * against the Triage ceiling, and a note while triage is paused over it.
 */
export const TriageSpend: FC<TriageSpendProps> = ({
  spendUsd,
  ceilingUsd,
  paused,
}) => (
  <Inline gap={2} alignY="center">
    <Text fontSize="small" color="muted">
      {`Triage today: ${formatCost(spendUsd)} of ${formatCost(ceilingUsd)}`}
    </Text>
    {paused && (
      <Text fontSize="small" color="muted" fontWeight="bold">
        triage paused: over ceiling
      </Text>
    )}
  </Inline>
);
